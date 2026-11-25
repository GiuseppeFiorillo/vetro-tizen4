using System;
using System.IO;
using Launcher.Native;

internal static class PairingDisplay
{
    private static readonly Efl.TaskCb TickCb = Tick;
    private static string _state;
    private static IntPtr _win, _countdown;
    private static long _until;
    private static string _code, _name;
    private static bool Read()
    {
        try
        {
            string[] s = File.ReadAllLines(_state);
            if (s.Length < 3 || s[0].Length != 6 || !long.TryParse(s[2], out _until)) return false;
            foreach (char c in s[0]) if (c < '0' || c > '9') return false;
            _code = s[0]; _name = s[1].Length <= 40 ? s[1] : s[1].Substring(0, 40);
            return _until > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
        catch { return false; }
    }
    private static IntPtr Text(IntPtr canvas, string text, int size, int y)
    {
        IntPtr t = Efl.evas_object_text_add(canvas);
        Efl.evas_object_text_font_set(t, "Sans", size);
        Efl.evas_object_text_text_set(t, text);
        Efl.evas_object_color_set(t, 245, 248, 255, 255);
        Efl.evas_object_move(t, (820 - Efl.evas_object_text_horiz_advance_get(t)) / 2, y);
        Efl.evas_object_show(t); return t;
    }
    private static byte Tick(IntPtr unused)
    {
        if (!Read()) { Efl.evas_object_hide(_win); Efl.elm_exit(); return 0; }
        int left = (int)Math.Ceiling((_until - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) / 1000.0);
        Efl.evas_object_text_text_set(_countdown, "Expires in " + left + " seconds");
        Efl.evas_object_move(_countdown, (820 - Efl.evas_object_text_horiz_advance_get(_countdown)) / 2, 270);
        return 1;
    }
    private static int Main(string[] args)
    {
        // The code is read from a private RAM file, never from argv or logs.
        if (args.Length != 1 || !Path.IsPathRooted(args[0])) return 2;
        _state = args[0]; if (!Read()) return 0;
        Environment.SetEnvironmentVariable("ELM_ENGINE", "wayland_egl");
        Environment.SetEnvironmentVariable("XDG_RUNTIME_DIR", "/run");
        Environment.SetEnvironmentVariable("WAYLAND_DISPLAY", "wayland-0");
        Efl.elm_init(0, IntPtr.Zero);
        try
        {
            _win = Efl.elm_win_add(IntPtr.Zero, "vetro-standalone-pairing", Efl.ElmWinNotification);
            if (_win == IntPtr.Zero) return 3;
            Efl.elm_win_title_set(_win, "Vetro standalone pairing");
            Efl.elm_win_borderless_set(_win, true); Efl.elm_win_alpha_set(_win, false);
            Efl.elm_win_prop_focus_skip_set(_win, true); Efl.elm_win_layer_set(_win, 950);
            int x,y,w,h; Efl.elm_win_screen_size_get(_win,out x,out y,out w,out h);
            if(w<820 || h<340) {w=1920;h=1080;}
            Efl.evas_object_resize(_win,820,340); Efl.evas_object_move(_win,(w-820)/2,(h-340)/2);
            IntPtr canvas=Efl.evas_object_evas_get(_win),bg=Efl.evas_object_rectangle_add(canvas);
            Efl.evas_object_color_set(bg,8,15,35,255);Efl.evas_object_resize(bg,820,340);Efl.evas_object_show(bg);
            Text(canvas,"Pair Vetro standalone",32,30);
            Text(canvas,_code.Substring(0,3)+" "+_code.Substring(3),78,94);
            Text(canvas,_name,26,208);
            _countdown=Text(canvas,"Pairing code",22,270);
            Efl.ecore_timer_add(0.5,TickCb,IntPtr.Zero);
            Efl.evas_object_show(_win);Efl.elm_run();return 0;
        }
        finally { Efl.elm_shutdown(); }
    }
}
