using System;

namespace Launcher.Core
{
    internal static class SystemLaunch
    {
        // Test the real app_launcher's exit code in the detached shell, not the shell-start result.
        public static string Command(string appId, string fallback, bool legacyRuntime = false)
        {
            if (!Catalog.ValidAppId(appId) || (fallback != null && !Catalog.ValidAppId(fallback)))
                throw new ArgumentException("Invalid system app id");
            // On Kant-M2, app_launcher may report success without showing Home.
            // Match the native owner route used by the tested recovery fallback.
            string command = legacyRuntime && appId == "com.samsung.tv.csfs"
                ? "/usr/bin/aul_test launch_async_for_uid com.samsung.tv.csfs 5001"
                : "/usr/bin/app_launcher -s " + appId;
            if (fallback != null) command += " || /usr/bin/app_launcher -s " + fallback;
            return "( " + command + " ) >/dev/null 2>&1 &";
        }
    }
}
