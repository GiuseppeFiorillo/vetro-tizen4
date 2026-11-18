using System;

namespace Launcher.Core
{
    internal static class LegacyTvActions
    {
        public static string Key(string key)
        {
            if (string.IsNullOrEmpty(key) || key.Length > 64) throw new ArgumentException("Invalid key");
            foreach (char c in key)
                if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')))
                    throw new ArgumentException("Invalid key");
            const string bus = "/usr/bin/dbus-send --system --print-reply --dest=org.enlightenment.wm /org/enlightenment/wm org.enlightenment.wm.Test.EventKey ";
            return bus + "uint32:0 string:" + key + " && " + bus + "uint32:1 string:" + key;
        }

        // QE49Q6FNA: the owner's native Home opens TV Plus on channel 4999.
        public static string Command(string slug, string appId)
        {
            // Kant-M2 advertises web widget IDs for tiles actually opened by native
            // runtimes. Launching the widgets directly starts a different YouTube
            // session or a Netflix black screen. Use the owner's native runtime.
            string native = null;
            if (appId == "9Ur5IzDKqV.TizenYouTube" || appId == "com.samsung.tv.cobalt-yt")
                native = "com.samsung.tv.cobalt-yt";
            else if (appId == "RN1MCdNq8t.Netflix" || appId == "org.tizen.netflix-app")
                native = "org.tizen.netflix-app";
            if (native != null)
                return "( /usr/bin/app_launcher -s " + native + " -u 5001 ) >>/home/owner/tvlauncher-system-launch.log 2>&1 &";

            if (appId != "org.tizen.tv-viewer" || (slug != "tvplus" && slug != "livetv")) return null;
            string command = "/usr/bin/aul_test launch_async_for_uid org.tizen.tv-viewer 5001 change_source 0 sourceType 0 sourceName TV mbrIndex -2 __K_EX_LAUNCH_REQUESTOR user";
            if (slug == "tvplus")
            {
                command += "; sleep 0.5";
                foreach (string key in new[] { "4", "9", "9", "9", "Return" })
                    command += "; " + Key(key) + "; sleep 0.2";
            }
            return "( " + command + " ) >>/home/owner/tvlauncher-system-launch.log 2>&1 &";
        }
    }
}
