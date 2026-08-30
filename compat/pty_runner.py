#!/usr/bin/env python3
"""Run a command in a PTY while proxying bytes over ordinary stdin/stdout pipes."""

from __future__ import annotations

import fcntl
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: pty_runner.py COMMAND [ARG ...]", file=sys.stderr)
        return 2

    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    child = subprocess.Popen(
        sys.argv[1:],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        start_new_session=True,
    )
    os.close(slave)

    def forward_signal(signum: int, _frame: object) -> None:
        if child.poll() is None:
            os.killpg(child.pid, signum)

    signal.signal(signal.SIGINT, forward_signal)
    signal.signal(signal.SIGTERM, forward_signal)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    watch_stdin = True
    try:
        while child.poll() is None:
            sources = [master]
            if watch_stdin:
                sources.append(stdin_fd)
            readable, _, _ = select.select(sources, [], [], 0.1)
            if master in readable:
                try:
                    data = os.read(master, 65536)
                except OSError:
                    data = b""
                if data:
                    os.write(stdout_fd, data)
            if watch_stdin and stdin_fd in readable:
                data = os.read(stdin_fd, 65536)
                if data:
                    os.write(master, data)
                else:
                    watch_stdin = False

        while True:
            readable, _, _ = select.select([master], [], [], 0)
            if master not in readable:
                break
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(stdout_fd, data)
    finally:
        os.close(master)
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()

    return child.returncode


if __name__ == "__main__":
    raise SystemExit(main())
