package local.terminal;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.net.auth.Credentials;
import org.apache.guacamole.net.auth.credentials.CredentialsInfo;
import org.apache.guacamole.net.auth.credentials.GuacamoleInsufficientCredentialsException;
import org.apache.guacamole.net.auth.credentials.GuacamoleInvalidCredentialsException;
import org.apache.guacamole.net.auth.simple.SimpleAuthenticationProvider;
import org.apache.guacamole.protocol.GuacamoleConfiguration;

/** Validates the requested account against its pinned SSH server. */
public final class SystemSshAuthenticationProvider extends SimpleAuthenticationProvider {
    // JSch pins Ed25519; guacd's libssh2 negotiates ECDSA.
    private static final String KINDLE_HOST = "192.168.100.207";
    private static final String KINDLE_HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAvpQRYWc9JCE5CsKeKyjgx7riJP0AI9aQPmWZ7KdiP2";
    private static final String KINDLE_TERMINAL_HOST_KEY = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBFUeD6DlE5c8en2BPp/GmVmMJrEFf//9cNJFzQA7DRlksqLHMFxTn+Vt7kxIvpOTFRnb77gJc9mUqylxjQpSs4k=";

    @Override
    public String getIdentifier() {
        return "kindle-terminal";
    }

    @Override
    public Map<String, GuacamoleConfiguration> getAuthorizedConfigurations(Credentials credentials)
            throws GuacamoleException {
        String username = credentials.getUsername();
        String password = credentials.getPassword();
        if (username == null || password == null) {
            throw new GuacamoleInsufficientCredentialsException(
                    "Kindle login required.", CredentialsInfo.USERNAME_PASSWORD);
        }
        if (!"kindle".equals(username) || password.isEmpty() || password.length() > 1024) {
            throw new GuacamoleInvalidCredentialsException(
                    "Invalid login.", CredentialsInfo.USERNAME_PASSWORD);
        }

        String host = KINDLE_HOST;
        String user = "root";
        String hostKey = KINDLE_HOST_KEY;
        String terminalHostKey = KINDLE_TERMINAL_HOST_KEY;
        Session session = null;
        try {
            JSch ssh = new JSch();
            ssh.setKnownHosts(new ByteArrayInputStream(
                    (host + " " + hostKey + "\n").getBytes(StandardCharsets.UTF_8)));
            session = ssh.getSession(user, host, 22);
            session.setConfig("StrictHostKeyChecking", "yes");
            session.setConfig("PreferredAuthentications", "password");
            session.setConfig("server_host_key", "ssh-ed25519");
            session.setPassword(password);
            session.setTimeout(10000);
            session.connect(10000);
        }
        catch (JSchException failure) {
            // Never expose passwords, account status, or SSH internals to the browser.
            throw new GuacamoleInvalidCredentialsException(
                    "Invalid login.", CredentialsInfo.USERNAME_PASSWORD);
        }
        finally {
            if (session != null) session.disconnect();
        }

        GuacamoleConfiguration terminal = new GuacamoleConfiguration();
        terminal.setProtocol("ssh");
        terminal.setParameter("hostname", host);
        terminal.setParameter("port", "22");
        terminal.setParameter("username", user);
        terminal.setParameter("password", password);
        terminal.setParameter("host-key", host + " " + terminalHostKey);
        terminal.setParameter("enable-sftp", "false");
        terminal.setParameter("font-name", "monospace");
        terminal.setParameter("font-size", "14");
        terminal.setParameter("color-scheme", "gray-black");
        return Collections.singletonMap("kindle", terminal);
    }
}
