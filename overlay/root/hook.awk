#!/usr/bin/gawk -f
# NU7100 guarded recurring root. Restore vendor bytes before starting anything.
BEGIN {
    if (ENVIRON["VETRO_TRIAL_CHECK"] == "1") exit 0
    bootLog = "/opt/vetro-root/boot.log"
    restore = "umask 077; printf '%s' '{{VENDOR_BASE64}}' | /usr/bin/base64 -d > '/opt/etc/parseinfo.sh.vetro-restore' && echo '81b774498adafea47f2dba2635eff7f070730bdaa9cc167f23934fded49df0f8  /opt/etc/parseinfo.sh.vetro-restore' | /usr/bin/sha256sum -c - >/dev/null && chmod 555 '/opt/etc/parseinfo.sh.vetro-restore' && /usr/bin/chsmack -a _ '/opt/etc/parseinfo.sh.vetro-restore' && mv -f '/opt/etc/parseinfo.sh.vetro-restore' '/opt/etc/parseinfo.sh'"
    if (system(restore) != 0) {
        print "restore failed; root trial skipped" >> bootLog
        close(bootLog)
        # Preserve the stock hook's only operation even if restoration fails.
        while ((getline line < "/etc/prd_info.ini") > 0) {
            if (line ~ /^Build=/) { split(line,a,"="); repo=a[2]; sub(/;.*/,"",repo) }
            else if (line ~ /^Model=/) { split(line,a,"="); model=a[2]; sub(/;.*/,"",model) }
        }
        close("/etc/prd_info.ini")
        print "__" repo "__" model > "/proc/target_version"
        close("/proc/target_version")
        exit 0
    }
    print "vendor hook restored before root startup" >> bootLog
    close(bootLog)
    system("/bin/bash /opt/etc/parseinfo.sh")
    # A failed/missing helper cannot prevent subsequent stock boots.
    if (system("test -e '/opt/usr/home/owner/share/tmp/sdk_tools/VETRO-ROOT-DISABLE'") == 0) exit 0
    if (system("grep -q '^BUILD_ID=T-KTM2LDEUC-REL-202606052034$' /etc/os-release") != 0) exit 0
    cmd = "echo 'bb8b6b968e1eae29883cf79bd72e0447697e79aaa717693be8afb3e71dcede19  /opt/vetro-root/root-daemon.js' | /usr/bin/sha256sum -c - >/dev/null && echo '4b0a30abca8655f44b8f656a4231ba5da95338d7727efcc6478d6ec67240d9e0  /opt/vetro-root/startup.js' | /usr/bin/sha256sum -c - >/dev/null && echo '5769ea724cfabf8667e94a5ef312883261f1f9680d8aa72ca1e4d0f5285723e5  /opt/vetro-root/vetro-rootd.service' | /usr/bin/sha256sum -c - >/dev/null && cp '/opt/vetro-root/vetro-rootd.service' '/run/systemd/system/vetro-rootd.service' && /usr/bin/chsmack -a _ '/run/systemd/system/vetro-rootd.service' && /usr/bin/systemctl daemon-reload && /usr/bin/systemctl start --no-block vetro-rootd.service"
    result = system(cmd)
    print "root trial queued status=" result >> bootLog
    close(bootLog)
    exit 0
}
