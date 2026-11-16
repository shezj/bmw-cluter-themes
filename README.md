# Shez Cluster Themes

Version 0.1.2 adds installation diagnostics. During a Store build on the car,
the app runs the firmware's SOME/IP interface and ACL generators against a
copy of its generated manifest, including the Store's certification proxy
and unknown-interface filtering. It creates no vehicle connections and
does not change the package manifest or installed permissions.

If generation fails, installation stops and the Store's updater log contains
`SOMEIP CHECK:` lines with the multiline cause and any declarations that also
fail individually. Copy those lines when reporting an installation failure.
An unreadable firmware database or unsupported generator bundle also stops
the diagnostic build with its error. Passing this check does not guarantee
installation: it uses a representative app uid, while MainApp allocates the
real uid later. Desktop checks cannot validate the car's firmware.

A customised, complete Cluster Themes app for **BMW iDrive 7**, based on
[bimmer-lab/apps](https://github.com/bimmer-lab/apps). One app contains all
14 themes: **Apex, GT3, M, M View, Vector, Sport, Minimal, Track, Drag, Rally,
Retro 80s, Cruise, Dyno and Ribbon**, plus the original calibration layouts.

The separate app id `shez_cluster_themes` keeps its installation and settings
separate from the original `cluster_themes`. This repository is source only;
**do not upload the development bench's `.mgu` or `.tgz` files**.

## Install through MGU Store

1. Put the contents of this repository on a branch in your own GitHub repository.
   `mgu-repo.json`, `apps/`, `shared/`, `kit/` and `tools/` must be at its root,
   not nested inside an extra downloaded folder.
2. In MGU Store, open **Settings → Add source** and enter your `owner/repository`.
3. Select the branch containing this source, usually **main**. Choose a branch,
   not Releases: this repository does not publish prebuilt install bundles.
4. Install **Shez Cluster Themes**. Its required `cluster-render` version is
   **0.5.9 or newer**, for ETC2 RGB textures and uniform animations. Keep the
   official `robertnisipeanu/idrive-apps` source available for that dependency.
   The Store also resolves the Python and deploy tools needed for its source build.
5. The Store builds on the head unit using the SDK from a stock app already on
   it. No BMW SDK, extracted firmware, credentials or local settings belong in GitHub.
   Private repositories require authentication in the Store.
6. Open **Shez Cluster Themes** from iDrive's apps menu. First launch is deliberately
   **Off**, retaining BMW's display. With the car parked, choose a theme in the
   Themes page. Automatic selection by drive mode is initially disabled and can
   be configured later.

Both Cluster Themes apps may be installed, but leave the original **Off** while
using this one. Running two full-cluster themes at once can overlap and spend
the same renderer resources. Waze map integrations need their own Waze companion;
it is not bundled with this app and is not required for the basic themes.

See the [MGU Store publishing guide](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md)
for branch sources, private repositories and SDK handling.

## Parked-car acceptance checklist

This is an **experimental 0.1.0 source release**, not a car-validated production
release. Local tests do not prove compatibility with your head unit or KOMBI.
The upstream app documentation's X3 testing does not validate this modified G80 app.

- Select each theme and verify layout fit, fonts, colours and driver-camera clearance.
- Compare speed, gear, fuel/range, mileage, temperatures and mode with BMW's own
  readouts. An unavailable signal must not masquerade as a real zero.
- Verify BMW's warning indicators remain visible. Stop using the theme if a
  warning is hidden, a signal is misleading, or the display resets or freezes.
- Check **Off** restores OEM, and repeat after a normal vehicle shutdown/start.
- Configure units, time zone, fuel capacity, shift point and redline for your car.
  Inherited engine/power configuration and other themes' scales are not automatically
  recalibrated for a G80. Some readouts are estimates; do not treat them as ECU limits.
- Test cosmetic shift/limiter effects using the app's parked demo, **not by revving
  the engine to its limiter**. Apex's warm-up redline is the app's model; flashing
  follows its configured threshold, not a verified ECU limiter-active signal.
- Check other renderer clients separately: they share memory and upload budgets.

Keep BMW warnings authoritative. Do not configure or test the interface while
driving. These unofficial apps are not approved or supported by BMW and are
used at your own risk. There is no warranty; see [LICENSE](LICENSE).

## Development and checks

From this repository's root:

```sh
python3 tools/validate_store_source.py
python3 -m unittest discover -s tools -p 'test_store_source.py'
node tools/test_apex_motion.js
node tools/test_apex_panels.js
node tools/test_apex_mode_dial.js
node tools/test_mode_dial_display.js
node tools/test_gear_display.js
node tools/test_hud_text.js
node bench/server.js shez_cluster_themes
```

The bench is at **http://127.0.0.1:8078/**. It uses a local SDK stub; its output
is never suitable for installation. `tools/build_store.py` refuses that stub.
Source validation deliberately fails while a local `oap-sdk/` or private bench
data is present; use a clean checkout for release checks. The Git ignore rules
keep these out of commits. GitHub Actions checks the source and regression tests.

Font and mode-dial generators work with this app's separate identity:

```sh
uv run -q --with pillow python tools/bake_fonts.py shez_cluster_themes
uv run -q --with pillow python tools/bake_mode_dial.py
```

Existing theme settings and artwork are retained. Credits, upstream attribution
and third-party licences are in [the app NOTICE](apps/shez_cluster_themes/NOTICE),
[LICENSE](LICENSE) and [kit/LICENSE](kit/LICENSE). The graphite background is
owner-supplied artwork; this app is not a package of extracted BMW or Lamborghini UI assets.

For updates, commit the source changes and increment the app version in
`apps/shez_cluster_themes/app.json`. In the Store, **Check now** and update this
app from the same source. Branch commits are revisions; never update by publishing
bench-built bundles. The source exporter can make a fresh snapshot from your
development copy without including SDK or vehicle data.
