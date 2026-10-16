"""`python -m luno_desktop` and the PyInstaller entry point."""

from luno_desktop.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
