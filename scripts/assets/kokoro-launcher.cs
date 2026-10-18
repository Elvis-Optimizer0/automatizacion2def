using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;

internal static class KokoroRuntime
{
    private static string Quote(string value)
    {
        if (value == null) return "\"\"";
        if (value.Length == 0) return "\"\"";
        if (value.IndexOfAny(new[] { ' ', '\t', '"', '\\' }) < 0) return value;
        var sb = new StringBuilder("\"");
        foreach (var ch in value)
        {
            if (ch == '"' || ch == '\\') sb.Append('\\');
            sb.Append(ch);
        }
        sb.Append('"');
        return sb.ToString();
    }

    private static int Main(string[] args)
    {
        string exeDir;
        try
        {
            exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        }
        catch (Exception)
        {
            exeDir = AppDomain.CurrentDomain.BaseDirectory;
        }

        var python = Path.Combine(exeDir, "python", "python.exe");
        var runner = Path.Combine(exeDir, "runner.py");
        if (!File.Exists(python))
        {
            Console.Error.WriteLine("kokoro-runtime: no se encontro " + python);
            return 127;
        }
        if (!File.Exists(runner))
        {
            Console.Error.WriteLine("kokoro-runtime: no se encontro " + runner);
            return 127;
        }

        var startInfo = new ProcessStartInfo();
        startInfo.FileName = python;
        startInfo.UseShellExecute = false;
        startInfo.WorkingDirectory = exeDir;
        var arguments = new StringBuilder(Quote(runner));
        foreach (var arg in args)
        {
            arguments.Append(' ');
            arguments.Append(Quote(arg));
        }
        startInfo.Arguments = arguments.ToString();
        startInfo.EnvironmentVariables["PYTHONUTF8"] = "1";
        startInfo.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
        startInfo.EnvironmentVariables["PYTHONNOUSERSITE"] = "1";

        try
        {
            using (var process = Process.Start(startInfo))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("kokoro-runtime: " + ex.Message);
            return 1;
        }
    }
}
