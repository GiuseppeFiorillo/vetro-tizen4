# Home-key routing override

Tested on UE65NU7100 / T-KTM2LDEUC-1400.2. The profile verifies the expected
firmware and database rule; it does not establish support for other KANT-M2 models.

The standalone manager starts vetro-home-key.service after payload validation.
It waits for the dock and maintenance services, makes a private context-database
copy, removes only the short XF86Home launch of com.samsung.tv.csfs, then starts
a context manager in a private mount namespace. The original database, long press
and unrelated routing are unchanged.

Vetro receives the raw Home key. Its Samsung Home tile cancels pending guard
actions and uses the legacy owner-native launch route. Returning to Vetro arms
the guard to terminate Samsung Home and reclaim RAM. Samsung Home's cold-start
delay remains; the recovery service uses two native activations one second apart.

The supervisor restores vendor routing on failure, launcher loss, disable markers
or USB recovery. ExecStopPost also restores it when the service stops. Unexpected
failure creates HOME-KEY-DISABLE in the runtime directory to prevent repeated
attempts. Recovery stops this override before opening Samsung Home, while
retaining paired maintenance.

The normal build includes this integration and updates all manifest/hook links.
The internal tools/add-home-key.cjs utility validates input checksums and writes
a separate complete payload; it never installs or modifies an existing device.
Do not replace an individual runtime file without its linked manifests.

The recovery USB marker is a regular file named VETRO-STANDALONE-ROLLBACK
containing VETRO-STANDALONE-RECOVERY/1. No program is loaded from recovery storage.
