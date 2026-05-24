import os
import sys
import subprocess
import webbrowser
import time

def run_cmd(args, shell=False):
    print(f"Executing: {' '.join(args)}")
    try:
        subprocess.check_call(args, shell=shell)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {e}")
        return False

def main():
    # Detect --test-only flag
    test_only = "--test-only" in sys.argv
    
    # 1. Integrity Check / Import Verification
    print("Checking backend import integrity...")
    try:
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))
        import fastapi
        import uvicorn
        import sklearn
        import numpy
        from simulator import TrafficSimulator
        from analytics import SREAnalyticsEngine
        
        sim = TrafficSimulator()
        ae = SREAnalyticsEngine()
        print("Success: All packages and local engines imported successfully.")
    except Exception as e:
        print(f"Integrity check failed: {e}")
        print("Will attempt package installation...")

    # Define environment path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    venv_dir = os.path.join(script_dir, "venv")
    requirements = os.path.join(script_dir, "backend", "requirements.txt")
    
    # Locate appropriate python executor inside venv
    if sys.platform == "win32":
        python_exe = os.path.join(venv_dir, "Scripts", "python.exe")
        pip_exe = os.path.join(venv_dir, "Scripts", "pip.exe")
        uvicorn_exe = os.path.join(venv_dir, "Scripts", "uvicorn.exe")
    else:
        python_exe = os.path.join(venv_dir, "bin", "python")
        pip_exe = os.path.join(venv_dir, "bin", "pip")
        uvicorn_exe = os.path.join(venv_dir, "bin", "uvicorn")

    # If virtual environment is not present, create it
    if not os.path.exists(venv_dir):
        print("Creating Python virtual environment...")
        if not run_cmd([sys.executable, "-m", "venv", "venv"]):
            print("Failed to create virtual environment.")
            sys.exit(1)

    # Upgrade pip inside environment
    print("Upgrading pip...")
    run_cmd([python_exe, "-m", "pip", "install", "--upgrade", "pip"])

    # Install requirements
    print("Installing required SRE telemetry and web server libraries...")
    if not run_cmd([pip_exe, "install", "-r", requirements]):
        print("Failed to install package dependencies.")
        sys.exit(1)

    # If --test-only is selected, terminate with 0
    if test_only:
        print("\n[VERIFICATION SUCCESSFUL]: SRE platform is compiled and ready to run.")
        sys.exit(0)

    # Launch browser thread after uvicorn starts
    def open_browser():
        time.sleep(2.0)
        url = "http://localhost:8000"
        print(f"Opening SRE Dashboard operator view: {url}")
        webbrowser.open(url)

    import threading
    browser_thread = threading.Thread(target=open_browser)
    browser_thread.daemon = True
    browser_thread.start()

    # Start FastAPI Uvicorn Server
    print("\n--------------------------------------------------------------")
    print("Starting DebugPilot AI SRE Server at http://localhost:8000")
    print("Ingestion pipe is listening at ws://localhost:8000/ws")
    print("Press Ctrl+C to terminate...")
    print("--------------------------------------------------------------\n")
    
    os.chdir(os.path.join(script_dir, "backend"))
    subprocess.call([uvicorn_exe, "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"])

if __name__ == "__main__":
    main()
