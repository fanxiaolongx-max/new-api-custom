#!/usr/bin/env python3
"""Telnet-aware proxy for eNSP device consoles (used by Guacamole / telnet clients).

eNSP's console port never negotiates telnet options, so clients (guacd, macOS telnet)
assume the server will not echo and echo every key locally as well -> each typed
character shows up twice. This proxy:
  * tells the client up front: IAC WILL ECHO + IAC WILL SUPPRESS-GO-AHEAD (server echoes),
  * strips all telnet IAC negotiation the client sends before it reaches eNSP,
  * turns telnet "CR NUL" into a plain CR,
  * wakes a silent console and queries its VRP version after a user-view prompt.

Usage: ensp-console-proxy.py LISTEN_HOST[,HOST2...] LISTEN_PORT TARGET_HOST TARGET_PORT
"""
import asyncio
import sys
import re

IAC, SB, SE, WILL, WONT, DO, DONT = 255, 250, 240, 251, 252, 253, 254
ECHO, SGA = 1, 3
LHOST, LPORT, THOST, TPORT = (sys.argv[1:] or ["172.19.0.1", "12001", "127.0.0.1", "2001"])


class TelnetFilter:
    """Removes telnet commands from a client byte stream (state survives chunk boundaries)."""

    def __init__(self):
        self.state = "data"
        self.last_cr = False

    def feed(self, data: bytes) -> bytes:
        out = bytearray()
        for b in data:
            if self.state == "data":
                if b == IAC:
                    self.state = "iac"
                elif b == 0 and self.last_cr:
                    pass
                else:
                    out.append(b)
                self.last_cr = b == 13
            elif self.state == "iac":
                if b == IAC:
                    out.append(IAC)
                    self.state = "data"
                elif b in (WILL, WONT, DO, DONT):
                    self.state = "opt"
                elif b == SB:
                    self.state = "sb"
                else:
                    self.state = "data"
            elif self.state == "opt":
                self.state = "data"
            elif self.state == "sb":
                if b == IAC:
                    self.state = "sb_iac"
            elif self.state == "sb_iac":
                self.state = "data" if b == SE else "sb"
        return bytes(out)


async def client_to_device(reader, writer, manual_input):
    tf = TelnetFilter()
    try:
        while data := await reader.read(32768):
            clean = tf.feed(data)
            if clean:
                manual_input.set()
                writer.write(clean)
                await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def device_to_client(reader, writer, device, manual_input):
    try:
        # Only initialize a blank, newly connected console. Keep forwarding
        # negotiation and manual input immediately, even during the grace period.
        loop = asyncio.get_running_loop()
        wakes = 0
        output = b""
        deadline = loop.time() + 2
        while not manual_input.is_set():
            try:
                data = await asyncio.wait_for(reader.read(32768), deadline - loop.time())
            except asyncio.TimeoutError:
                if manual_input.is_set() or wakes >= 3 or output.strip():
                    break
                if wakes == 0:
                    device.write(b"\x15")
                    await device.drain()
                    await asyncio.sleep(0.12)
                    if manual_input.is_set():
                        break
                device.write(b"\r")
                await device.drain()
                wakes += 1
                deadline = loop.time() + 2
                continue
            if not data:
                return
            writer.write(data.replace(bytes([IAC]), bytes([IAC, IAC])))
            await writer.drain()
            output = (output + data)[-512:]
            # A blank line, colour change or cursor positioning draws no text.
            output = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", output)
            prompt = output.strip(b" \r\n\t\x00\x07\x08")
            if not prompt:
                output = b""
                continue
            if wakes and re.fullmatch(rb"<[A-Za-z0-9_.-]+>", prompt):
                if not manual_input.is_set():
                    device.write(b"display version | include VRP\r")
                    await device.drain()
                break
            if not wakes or not re.fullmatch(rb"<[A-Za-z0-9_.-]*", prompt):
                break
        while data := await reader.read(32768):
            writer.write(data.replace(bytes([IAC]), bytes([IAC, IAC])))
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def handle(client_r, client_w):
    client_w.write(bytes([IAC, WILL, ECHO, IAC, WILL, SGA]))
    await client_w.drain()
    try:
        dev_r, dev_w = await asyncio.open_connection(THOST, int(TPORT))
    except OSError:
        client_w.write(b"\r\n[eNSP console not reachable: start win7 and the device in eNSP]\r\n")
        await client_w.drain()
        client_w.close()
        return
    manual_input = asyncio.Event()
    await asyncio.gather(client_to_device(client_r, dev_w, manual_input),
                         device_to_client(dev_r, client_w, dev_w, manual_input))


async def main():
    # LISTEN_HOST may be a comma-separated list, e.g. "192.168.100.174,192.168.1.108"
    server = await asyncio.start_server(handle, LHOST.split(","), int(LPORT))
    async with server:
        await server.serve_forever()


asyncio.run(main())
