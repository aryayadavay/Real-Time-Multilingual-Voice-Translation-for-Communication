"""TalkBridge AI Application Launcher.

Runs the FastAPI backend and opens the TalkBridge calling application
in a dedicated standalone desktop app window (via Chrome/Edge app mode)
or standard browser.
"""

import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT = 8000
URL = f"http://localhost:{PORT}"


def get_python_interpreter() -> str:
    """Check if backend/.venv exists, otherwise use sys.executable."""
    backend_venv_py = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "backend",
        ".venv",
        "Scripts",
        "python.exe",
    )
    if os.path.isfile(backend_venv_py):
        return backend_venv_py
    return sys.executable


def wait_for_server(url: str, timeout: int = 20) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def find_browser_app_executable() -> str:
    """Look for Chrome or Edge to launch in standalone --app mode."""
    candidates = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path

    for name in ["chrome", "google-chrome", "msedge", "edge"]:
        which = shutil.which(name)
        if which:
            return which
    return ""


def main() -> None:
    print("=" * 60)
    print("  [*] Starting TalkBridge AI - Live Translation Calling App")
    print(f"  [*] URL: {URL}")
    print("=" * 60)

    py_exe = get_python_interpreter()
    print(f"[*] Using Python: {py_exe}")

    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")

    server_cmd = [
        py_exe,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(PORT),
    ]

    server_process = subprocess.Popen(server_cmd, cwd=backend_dir)

    try:
        print("[*] Waiting for backend server to initialize...")
        if wait_for_server(URL, timeout=25):
            print("[+] Server is online!")

            browser_path = find_browser_app_executable()
            if browser_path:
                print(f"[+] Opening App Window via {os.path.basename(browser_path)}...")
                subprocess.Popen([browser_path, f"--app={URL}", "--window-size=1200,850"])
            else:
                print("[+] Opening default browser...")
                webbrowser.open(URL)

            print("[*] TalkBridge AI is active! Press Ctrl+C to stop.")
            server_process.wait()
        else:
            print("[-] Server failed to respond to health check.")
    except KeyboardInterrupt:
        print("\n[*] Shutting down TalkBridge AI...")
    finally:
        server_process.terminate()
        try:
            server_process.wait(timeout=3)
        except Exception:
            server_process.kill()
        print("[*] Stopped.")


if __name__ == "__main__":
    main()
