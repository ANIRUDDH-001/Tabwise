// W2a containment feasibility probe: the only native boundary. Diagnostic code for one disposable hosted VM, never product
// code. Compiled in memory by Windows PowerShell 5.1 Add-Type only after w2a-host.ps1 has matched this file's SHA-256 to
// the value pinned in the workflow. Every Win32 call checks its result and throws Win32Exception with the API name.
// No shell, no command string built from untrusted text (QuoteArg is the documented MSVCRT rule), no administrator right,
// no UI limits, no breakaway permission on the owned job.
// Revision 2 (Codex HOLD): an observation that fails is never read as "gone". Identity checks return alive, gone,
// mismatch or unknown; pipe end of file is kept apart from read errors; every native handle has one cleanup owner.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace TabwiseW2a
{
    public sealed class JobLimits
    {
        public uint LimitFlags;
        public bool KillOnClose;
        public bool BreakawayOk;
        public bool SilentBreakawayOk;
        public uint UiRestrictions;
        public bool UiKnown;            // false when the UI-restriction query itself failed
        public int UiQueryError;        // Win32 error of that failure, else 0
    }

    public sealed class Accounting
    {
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    public sealed class Child
    {
        public int Pid;
        public long CreatedFileTime;
        public IntPtr ProcessHandle;
        public readonly List<string> StdoutLines = new List<string>();
        public readonly List<string> StderrLines = new List<string>();
        public long StdoutEofFileTime;   // 0 until ReadLine returns null (true end of file); never set by an error
        public long StderrEofFileTime;
        public long StdoutErrorFileTime; // 0 unless the read failed (IOException or other); the message is kept
        public long StderrErrorFileTime;
        public string StdoutError;
        public string StderrError;
        public bool Released;           // ProcessHandle closed by JobProbe.Release; the pump threads own the pipe ends
        internal Thread OutThread;
        internal Thread ErrThread;
        internal const int MaxLines = 2000;
        internal const int MaxLineChars = 16384;

        public string[] SnapshotStdout() { lock (StdoutLines) return StdoutLines.ToArray(); }
        public string[] SnapshotStderr() { lock (StderrLines) return StderrLines.ToArray(); }
    }

    public static class JobProbe
    {
        const uint JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800;
        const uint JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK = 0x00001000;
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
        const int JobObjectBasicAccountingInformation = 1;
        const int JobObjectBasicProcessIdList = 3;
        const int JobObjectBasicUIRestrictions = 4;
        const int JobObjectExtendedLimitInformation = 9;
        const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        const uint CREATE_NO_WINDOW = 0x08000000;
        const uint CREATE_BREAKAWAY_FROM_JOB = 0x01000000;
        const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        const int STARTF_USESTDHANDLES = 0x00000100;
        static readonly IntPtr PROC_THREAD_ATTRIBUTE_HANDLE_LIST = (IntPtr)0x00020002;
        static readonly IntPtr PROC_THREAD_ATTRIBUTE_JOB_LIST = (IntPtr)0x0002000D;
        const uint HANDLE_FLAG_INHERIT = 0x00000001;
        const uint PROCESS_TERMINATE = 0x0001;
        const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        const uint SYNCHRONIZE = 0x00100000;
        const uint TOKEN_QUERY = 0x0008;
        const int TokenIntegrityLevel = 25;
        const uint WAIT_OBJECT_0 = 0;
        const uint WAIT_TIMEOUT = 0x102;
        public const int ERROR_ACCESS_DENIED = 5;
        public const int ERROR_INVALID_PARAMETER = 87;   // OpenProcess: no process has this pid

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS
        {
            public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
        {
            public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime;
            public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            public int bInheritHandle;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct STARTUPINFO
        {
            public int cb;
            public string lpReserved, lpDesktop, lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PROCESS_INFORMATION
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, IntPtr info, uint length);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool QueryInformationJobObject(IntPtr hJob, int infoClass, IntPtr info, uint length, out uint returned);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateJobObject(IntPtr hJob, uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetHandleInformation(IntPtr h, out uint flags);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES sa, uint size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd,
            ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint WaitForSingleObject(IntPtr h, uint ms);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll")]
        static extern IntPtr GetCurrentProcess();
        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr info, int length, out int returned);
        [DllImport("advapi32.dll")]
        static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
        [DllImport("advapi32.dll")]
        static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);

        static Win32Exception Fail(string api) { return new Win32Exception(Marshal.GetLastWin32Error(), api + " failed"); }

        // ---- Job creation and inspection -------------------------------------------------------------------------

        /// <summary>Kill-on-close job, no breakaway, no UI limits. inheritable=true exists only for the T7 negative control.</summary>
        public static IntPtr CreateOwnedJob(bool inheritable)
        {
            IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw Fail("CreateJobObjectW");
            try
            {
                var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr buf = Marshal.AllocHGlobal(size);
                try
                {
                    Marshal.StructureToPtr(info, buf, false);
                    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, buf, (uint)size)) throw Fail("SetInformationJobObject");
                }
                finally { Marshal.FreeHGlobal(buf); }
                if (!SetHandleInformation(job, HANDLE_FLAG_INHERIT, inheritable ? HANDLE_FLAG_INHERIT : 0)) throw Fail("SetHandleInformation(job)");
                return job;
            }
            catch { CloseHandle(job); throw; }
        }

        public static bool HandleInheritable(IntPtr h)
        {
            uint flags;
            if (!GetHandleInformation(h, out flags)) throw Fail("GetHandleInformation");
            return (flags & HANDLE_FLAG_INHERIT) != 0;
        }

        /// <summary>Limits of job, or of the calling process's job when job is IntPtr.Zero. Returns null when the caller is in no job.</summary>
        public static JobLimits QueryLimits(IntPtr job)
        {
            int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr buf = Marshal.AllocHGlobal(size);
            try
            {
                uint returned;
                if (!QueryInformationJobObject(job, JobObjectExtendedLimitInformation, buf, (uint)size, out returned))
                {
                    if (job == IntPtr.Zero && !InAnyJob(GetCurrentProcess())) return null;
                    throw Fail("QueryInformationJobObject(limits)");
                }
                var info = (JOBOBJECT_EXTENDED_LIMIT_INFORMATION)Marshal.PtrToStructure(buf, typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                uint f = info.BasicLimitInformation.LimitFlags;
                var limits = new JobLimits { LimitFlags = f, KillOnClose = (f & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) != 0,
                    BreakawayOk = (f & JOB_OBJECT_LIMIT_BREAKAWAY_OK) != 0, SilentBreakawayOk = (f & JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK) != 0 };
                IntPtr ui = Marshal.AllocHGlobal(4);
                try
                {
                    if (QueryInformationJobObject(job, JobObjectBasicUIRestrictions, ui, 4, out returned)) { limits.UiRestrictions = (uint)Marshal.ReadInt32(ui); limits.UiKnown = true; }
                    else limits.UiQueryError = Marshal.GetLastWin32Error();
                }
                finally { Marshal.FreeHGlobal(ui); }
                return limits;
            }
            finally { Marshal.FreeHGlobal(buf); }
        }

        public static Accounting QueryAccounting(IntPtr job)
        {
            int size = Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
            IntPtr buf = Marshal.AllocHGlobal(size);
            try
            {
                uint returned;
                if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, buf, (uint)size, out returned)) throw Fail("QueryInformationJobObject(accounting)");
                var a = (JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)Marshal.PtrToStructure(buf, typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
                return new Accounting { TotalProcesses = a.TotalProcesses, ActiveProcesses = a.ActiveProcesses, TotalTerminatedProcesses = a.TotalTerminatedProcesses };
            }
            finally { Marshal.FreeHGlobal(buf); }
        }

        /// <summary>Process ids currently in the job (and its child jobs). Layout: two DWORD counts, then ULONG_PTR ids at offset 8.</summary>
        public static int[] JobPids(IntPtr job)
        {
            const int capacity = 4096;
            int size = 8 + capacity * IntPtr.Size;
            IntPtr buf = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.WriteInt32(buf, 0, capacity);
                uint returned;
                if (!QueryInformationJobObject(job, JobObjectBasicProcessIdList, buf, (uint)size, out returned)) throw Fail("QueryInformationJobObject(pids)");
                int assigned = Marshal.ReadInt32(buf, 0), listed = Marshal.ReadInt32(buf, 4);
                if (listed != assigned) throw new InvalidOperationException("job pid list truncated: " + listed + " of " + assigned);
                var pids = new int[listed];
                for (int i = 0; i < listed; i++) pids[i] = (int)Marshal.ReadIntPtr(buf, 8 + i * IntPtr.Size).ToInt64();
                return pids;
            }
            finally { Marshal.FreeHGlobal(buf); }
        }

        public static void TerminateJob(IntPtr job, uint exitCode)
        {
            if (!TerminateJobObject(job, exitCode)) throw Fail("TerminateJobObject");
        }

        public static void Close(IntPtr h)
        {
            if (h != IntPtr.Zero && !CloseHandle(h)) throw Fail("CloseHandle");
        }

        // ---- Per-process facts (identity = pid + creation FILETIME) -------------------------------------------------

        static bool InAnyJob(IntPtr process)
        {
            bool result;
            if (!IsProcessInJob(process, IntPtr.Zero, out result)) throw Fail("IsProcessInJob");
            return result;
        }

        /// <summary>null when the pid no longer exists or cannot be opened (the caller records which).</summary>
        public static IntPtr OpenQuery(int pid) { return OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, pid); }

        public static long CreationTime(IntPtr process)
        {
            long c, e, k, u;
            if (!GetProcessTimes(process, out c, out e, out k, out u)) throw Fail("GetProcessTimes");
            return c;
        }

        /// <summary>OpenProcess for query; error is 0 on success, else the Win32 error (87 means no such pid).</summary>
        public static IntPtr OpenQueryEx(int pid, out int error)
        {
            IntPtr p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, pid);
            error = p == IntPtr.Zero ? Marshal.GetLastWin32Error() : 0;
            return p;
        }

        /// <summary>
        /// State of the process with this pid and creation time (microsecond grain): "alive", "gone" (no such pid, or that
        /// process has exited), "mismatch" (the pid now names another process) or "unknown:&lt;win32 error&gt;". Only "gone"
        /// and "mismatch" are evidence of absence; "unknown" is never read as gone.
        /// </summary>
        public static string IdentityState(int pid, long createdFileTime)
        {
            int error;
            IntPtr p = OpenQueryEx(pid, out error);
            if (p == IntPtr.Zero) return error == ERROR_INVALID_PARAMETER ? "gone" : "unknown:" + error;
            try
            {
                long c, e, k, u;
                if (!GetProcessTimes(p, out c, out e, out k, out u)) return "unknown:" + Marshal.GetLastWin32Error();
                if (c / 10 != createdFileTime / 10) return "mismatch";
                uint w = WaitForSingleObject(p, 0);
                if (w == WAIT_OBJECT_0) return "gone";
                if (w == WAIT_TIMEOUT) return "alive";
                return "unknown:" + Marshal.GetLastWin32Error();
            }
            finally { CloseHandle(p); }
        }

        /// <summary>Unwraps PowerShell's MethodInvocationException; returns the Win32 error code, or -1 if none.</summary>
        public static int Win32Code(Exception e)
        {
            for (; e != null; e = e.InnerException) { var w = e as Win32Exception; if (w != null) return w.NativeErrorCode; }
            return -1;
        }

        public static long SelfCreationTime() { return CreationTime(GetCurrentProcess()); }
        public static bool SelfInAnyJob() { return InAnyJob(GetCurrentProcess()); }

        public static bool InJob(IntPtr process, IntPtr job)
        {
            bool result;
            if (!IsProcessInJob(process, job, out result)) throw Fail("IsProcessInJob");
            return result;
        }

        public static bool InAnyJobPublic(IntPtr process) { return InAnyJob(process); }

        /// <summary>Mandatory integrity RID of the process token (0x0000 untrusted, 0x1000 low, 0x2000 medium, 0x3000 high, 0x4000 system).</summary>
        public static int IntegrityRid(IntPtr process)
        {
            IntPtr token;
            if (!OpenProcessToken(process, TOKEN_QUERY, out token)) throw Fail("OpenProcessToken");
            try
            {
                int needed;
                GetTokenInformation(token, TokenIntegrityLevel, IntPtr.Zero, 0, out needed);
                if (needed <= 0 || needed > 4096) throw Fail("GetTokenInformation(size)");
                IntPtr buf = Marshal.AllocHGlobal(needed);
                try
                {
                    if (!GetTokenInformation(token, TokenIntegrityLevel, buf, needed, out needed)) throw Fail("GetTokenInformation");
                    IntPtr sid = Marshal.ReadIntPtr(buf);
                    int count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
                    return Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1)));
                }
                finally { Marshal.FreeHGlobal(buf); }
            }
            finally { CloseHandle(token); }
        }

        /// <summary>
        /// Terminate one process only if its creation time still matches (pid-reuse guard). Never throws. Returns
        /// terminated | gone | mismatch | pending (still running after waitMs) | unknown:&lt;error&gt; (could not open or query) |
        /// error:&lt;error&gt; (TerminateProcess refused). Only terminated, gone and mismatch are final.
        /// </summary>
        public static string TerminatePinned(int pid, long createdFileTime, uint waitMs)
        {
            IntPtr p = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, pid);
            if (p == IntPtr.Zero)
            {
                int error = Marshal.GetLastWin32Error();
                return error == ERROR_INVALID_PARAMETER ? "gone" : "unknown:" + error;
            }
            try
            {
                long c, e, k, u;
                if (!GetProcessTimes(p, out c, out e, out k, out u)) return "unknown:" + Marshal.GetLastWin32Error();
                if (c / 10 != createdFileTime / 10) return "mismatch";
                if (WaitForSingleObject(p, 0) == WAIT_OBJECT_0) return "gone";
                if (!TerminateProcess(p, 0xC0DE0007))
                {
                    int error = Marshal.GetLastWin32Error();
                    return WaitForSingleObject(p, 0) == WAIT_OBJECT_0 ? "gone" : "error:" + error;
                }
                return WaitForSingleObject(p, waitMs) == WAIT_OBJECT_0 ? "terminated" : "pending";
            }
            finally { CloseHandle(p); }
        }

        // ---- Process creation ---------------------------------------------------------------------------------------

        /// <summary>MSVCRT/CommandLineToArgvW quoting of one argument.</summary>
        public static string QuoteArg(string a)
        {
            if (a == null) throw new ArgumentNullException("a");
            if (a.IndexOf('\0') >= 0) throw new ArgumentException("argument contains NUL");
            if (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0) return a;
            var sb = new StringBuilder("\"");
            for (int i = 0; ; i++)
            {
                int slashes = 0;
                while (i < a.Length && a[i] == '\\') { slashes++; i++; }
                if (i == a.Length) { sb.Append('\\', slashes * 2); break; }
                if (a[i] == '"') { sb.Append('\\', slashes * 2 + 1); sb.Append('"'); }
                else { sb.Append('\\', slashes); sb.Append(a[i]); }
            }
            return sb.Append('"').ToString();
        }

        static IntPtr MakePipe(out IntPtr childEnd, bool childReads)
        {
            var sa = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)), bInheritHandle = 1 };
            IntPtr read, write;
            childEnd = IntPtr.Zero;
            if (!CreatePipe(out read, out write, ref sa, 0)) throw Fail("CreatePipe");
            IntPtr parentEnd = childReads ? write : read;
            if (!SetHandleInformation(parentEnd, HANDLE_FLAG_INHERIT, 0))
            {
                var failure = Fail("SetHandleInformation(pipe)");
                CloseHandle(read); CloseHandle(write);
                throw failure;
            }
            childEnd = childReads ? read : write;
            return parentEnd;
        }

        static void Pump(IntPtr parentRead, List<string> sink, Child child, bool isStdout)
        {
            // The SafeFileHandle owns parentRead from here; disposing the reader closes it exactly once.
            var reader = new StreamReader(new FileStream(new SafeFileHandle(parentRead, true), FileAccess.Read, 4096), new UTF8Encoding(false));
            try
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                    lock (sink) if (sink.Count < Child.MaxLines) sink.Add(line.Length > Child.MaxLineChars ? line.Substring(0, Child.MaxLineChars) : line);
                long eof = DateTime.UtcNow.ToFileTimeUtc();   // ReadLine returned null: every writer closed its end
                if (isStdout) Interlocked.Exchange(ref child.StdoutEofFileTime, eof); else Interlocked.Exchange(ref child.StderrEofFileTime, eof);
            }
            catch (Exception ex)
            {
                long at = DateTime.UtcNow.ToFileTimeUtc();     // a failed read is not end of file
                string message = ex.GetType().Name + ": " + ex.Message;
                if (isStdout) { child.StdoutError = message; Interlocked.Exchange(ref child.StdoutErrorFileTime, at); }
                else { child.StderrError = message; Interlocked.Exchange(ref child.StderrErrorFileTime, at); }
            }
            finally { reader.Dispose(); }
        }

        /// <summary>
        /// Creates app with argv. job != IntPtr.Zero: the child is created inside that job atomically (PROC_THREAD_ATTRIBUTE_JOB_LIST).
        /// Inheritance is limited to the three stdio pipe ends plus extraInherit (T7 only) by PROC_THREAD_ATTRIBUTE_HANDLE_LIST.
        /// breakaway=true asks for CREATE_BREAKAWAY_FROM_JOB (T3); the caller expects ERROR_ACCESS_DENIED.
        /// </summary>
        public static Child Spawn(IntPtr job, string app, string[] args, IntPtr[] extraInherit, bool breakaway, string cwd)
        {
            if (!Path.IsPathRooted(app) || !File.Exists(app)) throw new ArgumentException("app must be an existing absolute path: " + app);
            var cmd = new StringBuilder(QuoteArg(app));
            foreach (var a in args) cmd.Append(' ').Append(QuoteArg(a));
            if (cmd.Length >= 32767) throw new ArgumentException("command line too long");

            // Cleanup owner until return: this method (catch and finally below). After return: Child.ProcessHandle is owned by
            // Release, and the parent read ends by the pump threads. A handle variable is zeroed when its ownership moves.
            IntPtr inChild = IntPtr.Zero, outChild = IntPtr.Zero, errChild = IntPtr.Zero;
            IntPtr inParent = IntPtr.Zero, outParent = IntPtr.Zero, errParent = IntPtr.Zero;
            IntPtr attrList = IntPtr.Zero, handleArray = IntPtr.Zero, jobArray = IntPtr.Zero;
            IntPtr hProcess = IntPtr.Zero;
            bool listInitialized = false;
            try
            {
                inParent = MakePipe(out inChild, true);
                outParent = MakePipe(out outChild, false);
                errParent = MakePipe(out errChild, false);
                var inherit = new List<IntPtr> { inChild, outChild, errChild };
                if (extraInherit != null) inherit.AddRange(extraInherit);
                int attrCount = job == IntPtr.Zero ? 1 : 2;
                IntPtr size = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, attrCount, 0, ref size);
                attrList = Marshal.AllocHGlobal(size);
                if (!InitializeProcThreadAttributeList(attrList, attrCount, 0, ref size)) throw Fail("InitializeProcThreadAttributeList");
                listInitialized = true;
                handleArray = Marshal.AllocHGlobal(IntPtr.Size * inherit.Count);
                for (int i = 0; i < inherit.Count; i++) Marshal.WriteIntPtr(handleArray, i * IntPtr.Size, inherit[i]);
                if (!UpdateProcThreadAttribute(attrList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handleArray, (IntPtr)(IntPtr.Size * inherit.Count), IntPtr.Zero, IntPtr.Zero))
                    throw Fail("UpdateProcThreadAttribute(HANDLE_LIST)");
                if (job != IntPtr.Zero)
                {
                    jobArray = Marshal.AllocHGlobal(IntPtr.Size);
                    Marshal.WriteIntPtr(jobArray, job);
                    if (!UpdateProcThreadAttribute(attrList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, jobArray, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
                        throw Fail("UpdateProcThreadAttribute(JOB_LIST)");
                }
                var si = new STARTUPINFOEX();
                si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                si.StartupInfo.hStdInput = inChild; si.StartupInfo.hStdOutput = outChild; si.StartupInfo.hStdError = errChild;
                si.lpAttributeList = attrList;
                uint flags = EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | (breakaway ? CREATE_BREAKAWAY_FROM_JOB : 0);
                PROCESS_INFORMATION pi;
                if (!CreateProcessW(app, cmd, IntPtr.Zero, IntPtr.Zero, true, flags, IntPtr.Zero, cwd, ref si, out pi)) throw Fail("CreateProcessW");
                hProcess = pi.hProcess;
                CloseHandle(pi.hThread);
                var child = new Child { Pid = pi.dwProcessId, ProcessHandle = hProcess, CreatedFileTime = CreationTime(hProcess) };
                // Child ends are closed here so the pipes reach end of file when every holder in the tree has exited.
                CloseHandle(inChild); inChild = IntPtr.Zero;
                CloseHandle(outChild); outChild = IntPtr.Zero;
                CloseHandle(errChild); errChild = IntPtr.Zero;
                CloseHandle(inParent); inParent = IntPtr.Zero;   // the child's stdin is at end of file from the start
                IntPtr o = outParent, e = errParent;
                outParent = IntPtr.Zero; errParent = IntPtr.Zero;
                child.OutThread = new Thread(() => Pump(o, child.StdoutLines, child, true)) { IsBackground = true };
                child.ErrThread = new Thread(() => Pump(e, child.StderrLines, child, false)) { IsBackground = true };
                child.OutThread.Start(); child.ErrThread.Start();
                hProcess = IntPtr.Zero;   // owned by child from here
                return child;
            }
            catch
            {
                // A process created before the failure is terminated here, not left to the job: job may be IntPtr.Zero.
                if (hProcess != IntPtr.Zero) { TerminateProcess(hProcess, 0xC0DE0008); WaitForSingleObject(hProcess, 5000); CloseHandle(hProcess); }
                throw;
            }
            finally
            {
                if (listInitialized) DeleteProcThreadAttributeList(attrList);
                if (attrList != IntPtr.Zero) Marshal.FreeHGlobal(attrList);
                if (handleArray != IntPtr.Zero) Marshal.FreeHGlobal(handleArray);
                if (jobArray != IntPtr.Zero) Marshal.FreeHGlobal(jobArray);
                foreach (var h in new[] { inChild, outChild, errChild, inParent, outParent, errParent }) if (h != IntPtr.Zero) CloseHandle(h);
            }
        }

        /// <summary>true when the process exited within ms; exitCode is then valid.</summary>
        public static bool WaitExit(Child c, uint ms, out uint exitCode)
        {
            exitCode = 0;
            uint r = WaitForSingleObject(c.ProcessHandle, ms);
            if (r == WAIT_TIMEOUT) return false;
            if (r != WAIT_OBJECT_0) throw Fail("WaitForSingleObject");
            if (!GetExitCodeProcess(c.ProcessHandle, out exitCode)) throw Fail("GetExitCodeProcess");
            return true;
        }

        /// <summary>Closes the process handle (idempotent). Never waits on the pump threads, so a held pipe cannot block it.</summary>
        public static void Release(Child c)
        {
            if (c == null) return;
            IntPtr h = Interlocked.Exchange(ref c.ProcessHandle, IntPtr.Zero);
            if (h != IntPtr.Zero) CloseHandle(h);
            c.Released = true;
        }

        /// <summary>Bounded wait for both pump threads; false if a pipe is still held open after ms.</summary>
        public static bool PumpsFinished(Child c, int ms)
        {
            var deadline = DateTime.UtcNow.AddMilliseconds(ms);
            foreach (var t in new[] { c.OutThread, c.ErrThread })
            {
                int left = (int)Math.Max(0, (deadline - DateTime.UtcNow).TotalMilliseconds);
                if (t != null && !t.Join(left)) return false;
            }
            return true;
        }
    }
}
