using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Security.Principal;

internal static class Program
{
    private static readonly object LogLock = new object();

    private static void AppendLog(string logPath, string message)
    {
        lock (LogLock)
        {
            File.AppendAllText(
                logPath,
                "[" + DateTime.Now.ToString("s") + "] " + message + Environment.NewLine,
                Encoding.UTF8
            );
        }
    }

    private static bool IsAdmin()
    {
        using (var identity = WindowsIdentity.GetCurrent())
        {
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
    }

    private static int RelaunchAsAdmin()
    {
        var exePath = Process.GetCurrentProcess().MainModule.FileName;
        var psi = new ProcessStartInfo
        {
            FileName = exePath,
            Arguments = "--elevated",
            UseShellExecute = true,
            Verb = "runas",
            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
        };

        try
        {
            using (var process = Process.Start(psi))
            {
                if (process != null)
                {
                    process.WaitForExit();
                    return process.ExitCode;
                }
            }

            return 1;
        }
        catch
        {
            Console.Error.WriteLine("[launcher] Elevation was cancelled or blocked.");
            Console.WriteLine("Press Enter to close...");
            Console.ReadLine();
            return 1;
        }
    }

    private static int RunPowerShell(string workingDirectory, string scriptPath, string logPath)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"",
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = false
        };

        using (var process = new Process())
        {
            process.StartInfo = psi;
            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                {
                    Console.WriteLine(e.Data);
                    AppendLog(logPath, "[stdout] " + e.Data);
                }
            };
            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                {
                    Console.Error.WriteLine(e.Data);
                    AppendLog(logPath, "[stderr] " + e.Data);
                }
            };

            AppendLog(logPath, "Running: " + scriptPath);
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();
            AppendLog(logPath, "Exit code (" + Path.GetFileName(scriptPath) + "): " + process.ExitCode);
            return process.ExitCode;
        }
    }

    private static int Main()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var logPath = Path.Combine(baseDir, "launcher.log");
        try
        {
            var args = Environment.GetCommandLineArgs();
            var isElevatedChild = args.Length > 1 && string.Equals(args[1], "--elevated", StringComparison.OrdinalIgnoreCase);
            if (!IsAdmin() && !isElevatedChild)
            {
                Console.WriteLine("[launcher] Admin rights are required. Requesting elevation...");
                return RelaunchAsAdmin();
            }

            var setupScript = Path.Combine(baseDir, "setup-local.ps1");
            var startScript = Path.Combine(baseDir, "start-all.ps1");

            AppendLog(logPath, "Launcher start");

            if (!File.Exists(setupScript))
            {
                Console.Error.WriteLine("Missing file: " + setupScript);
                return 1;
            }

            if (!File.Exists(startScript))
            {
                Console.Error.WriteLine("Missing file: " + startScript);
                return 1;
            }

            Console.WriteLine("[launcher] Starting Nubra Excel Plugin...");
            Console.WriteLine("[launcher] Folder: " + baseDir);

            var setupCode = RunPowerShell(baseDir, setupScript, logPath);
            if (setupCode != 0)
            {
                Console.Error.WriteLine("[launcher] setup-local.ps1 failed with exit code " + setupCode);
                AppendLog(logPath, "setup failed: " + setupCode);
                Console.WriteLine("Press Enter to close...");
                Console.ReadLine();
                return setupCode;
            }

            var startCode = RunPowerShell(baseDir, startScript, logPath);
            if (startCode != 0)
            {
                Console.Error.WriteLine("[launcher] start-all.ps1 failed with exit code " + startCode);
                AppendLog(logPath, "start failed: " + startCode);
                Console.WriteLine("Press Enter to close...");
                Console.ReadLine();
                return startCode;
            }

            Console.WriteLine("[launcher] Completed.");
            AppendLog(logPath, "Launcher completed");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[launcher] Fatal error: " + ex.Message);
            AppendLog(logPath, "fatal: " + ex);
            Console.WriteLine("Press Enter to close...");
            Console.ReadLine();
            return 1;
        }
    }
}
