const { exec } = require('child_process');
const fs = require('fs');

/**
 * F\u00fchrt einen Bash-Befehl in einem bestimmten Verzeichnis aus.
 * Hat Root-Rechte wenn der Server als Root l\u00e4uft.
 */
function executeCommand(command, cwd) {
    // Sicherheitscheck: Verzeichnis muss existieren
    if (cwd && !fs.existsSync(cwd)) {
        try { require('child_process').execSync(`mkdir -p "${cwd}"`, { shell: '/bin/bash' }); }
        catch (e) { /* ignorieren */ }
    }

    return new Promise((resolve) => {
        exec(
            command,
            { cwd: cwd || '/', shell: '/bin/bash', timeout: 120000, maxBuffer: 1024 * 1024 * 10 },
            (error, stdout, stderr) => {
                resolve({
                    stdout: (stdout || '').substring(0, 8000),
                    stderr: (stderr || '').substring(0, 4000),
                    error:  error ? error.message : null,
                    exitCode: error ? (error.code || 1) : 0
                });
            }
        );
    });
}

module.exports = { executeCommand };
