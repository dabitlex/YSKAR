**YSKAR Node Core 0.7.0** — the full YSKAR node with its own window, now for **Windows and Linux**: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers.

## New in 0.7.0

- **Node Core for Linux.** Next to the Windows installer there are now two Linux packages for 64-bit PCs (x86-64): a `.deb` for Ubuntu, Debian and Linux Mint, and an AppImage for other distributions. The program is the same as on Windows, with the same version and the same functions.
- **GPU mining on Linux.** The Linux packages include the CUDA miner `yskar-cuda` for NVIDIA cards, built for GTX 9xx up to RTX 50xx. It is also attached as a single file, `yskar-cuda-0.7.0-linux-x86_64`, for mining systems without a desktop such as HiveOS. Thanks to derhier for the Linux build proposal (issue #9).
- On Linux, "Start when you log in" creates an entry in `~/.config/autostart`, and texts that spoke of Windows have their own Linux version.

On Windows nothing changes for you: wallet, settings and data folder stay as they are. Consensus revision 5 from block 7,000 is already included since 0.6.0.

The Linux version is new. It has passed the automatic checks; please report anything that does not work on your system as an issue on GitHub.

## Install on Windows

1. Download and run `YSKAR-Node-Core-Setup-0.7.0.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-0.7.0.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit).

## Install on Linux

**Ubuntu, Debian, Linux Mint:**

```bash
sudo apt install ./YSKAR-Node-Core-0.7.0-amd64.deb
```

Then start “YSKAR Node Core” from the application menu.

**Other distributions:** make the AppImage executable and start it:

```bash
chmod +x YSKAR-Node-Core-0.7.0-x86_64.AppImage
./YSKAR-Node-Core-0.7.0-x86_64.AppImage
```

AppImages need FUSE 2 (on Ubuntu the package `libfuse2`, on 24.04 `libfuse2t64`).

Compare the checksum with the `.sha256` file:

```bash
sha256sum -c YSKAR-Node-Core-0.7.0-amd64.deb.sha256
```

**Requirements:** a 64-bit PC (x86-64) with a desktop. ARM computers such as the Raspberry Pi are not supported. The icon next to the clock needs a desktop that shows such icons (on GNOME the AppIndicator extension); without it the program runs normally.

## GPU mining

An NVIDIA card with a current driver (on Linux a driver for CUDA 12). Without it the processor does the work. Node Core uses one graphics card at a time.
