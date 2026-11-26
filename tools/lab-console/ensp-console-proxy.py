#!/usr/bin/env python3
"""Forward an eNSP console on the private Docker bridge, clearing any partial line.

The initial Ctrl-U/Enter asks VRP to draw a prompt without executing a previously
half-typed command. All subsequent terminal bytes are forwarded unchanged.
"""
import asyncio
import sys


async def pipe(reader, writer):
    try:
        while data := await reader.read(32768):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def handle(reader, writer):
    upstream = None
    try:
        remote, upstream = await asyncio.open_connection('127.0.0.1', 2001)
        upstream.write(b'\x15\r')
        await upstream.drain()
        await asyncio.gather(pipe(reader, upstream), pipe(remote, writer))
    except OSError:
        writer.write(b'\r\n[eNSP SW2 console unavailable]\r\n')
        await writer.drain()
    finally:
        if upstream:
            upstream.close()
        writer.close()


async def main():
    server = await asyncio.start_server(handle, '172.19.0.1', 12001)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
