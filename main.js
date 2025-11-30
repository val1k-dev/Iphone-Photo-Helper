const { app, BrowserWindow, ipcMain } = require('electron')
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')

// Disable hardware acceleration to avoid GPU cache errors
app.disableHardwareAcceleration()

const configPath = path.join(app.getPath('userData'), 'config.json')

function loadConfig() {
	try {
		if (fs.existsSync(configPath)) {
			return JSON.parse(fs.readFileSync(configPath, 'utf8'))
		}
	} catch (e) {
		console.error('Failed to load config:', e)
	}
	return { language: 'en' }
}

function saveConfig(config) {
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
	} catch (e) {
		console.error('Failed to save config:', e)
	}
}

function createWindow() {
	const win = new BrowserWindow({
		width: 900,
		height: 700,
		icon: path.join(__dirname, 'icon.png'),
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		},
		resizable: false,
		autoHideMenuBar: true,
		frame: false,
	})

	win.loadFile('index.html')

	// Window control handlers
	ipcMain.handle('minimize-window', () => {
		win.minimize()
	})

	ipcMain.handle('close-window', () => {
		win.close()
	})
}

app.whenReady().then(() => {
	createWindow()
})

// IPC: List open File Explorer windows (HWND, title, path)
ipcMain.handle('list-explorer-windows', async () => {
	const ps = "$ErrorActionPreference='SilentlyContinue'; $shell = New-Object -ComObject Shell.Application; $wins = $shell.Windows(); $out = @(); foreach ($w in $wins) { try { $out += [pscustomobject]@{ Hwnd = $w.HWND; Title = $w.LocationName; Path = $w.Document.Folder.Self.Path; Name = $w.Name } } catch { } }; $out | ConvertTo-Json -Depth 4"
	return new Promise(resolve => {
		exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, (error, stdout) => {
			if (error) {
				console.error('Explorer windows enumeration failed:', error.message)
				resolve([])
				return
			}
			try {
				let data = []
				if (stdout && stdout.trim()) {
					data = JSON.parse(stdout)
					if (!Array.isArray(data)) data = [data]
				}
				resolve(data)
			} catch (e) {
				console.error('Explorer windows JSON parse failed:', e.message)
				resolve([])
			}
		})
	})
})

// (Removed: folder enumeration and per-folder size IPCs; focusing on media counting only)

// IPC: Count media files (by extension) in the currently selected Explorer window (top-level only)
ipcMain.handle('count-media-in-window', async (event, hwnd) => {
	const ps = `$hwnd = ${Number(hwnd)}; $ErrorActionPreference='SilentlyContinue'; $shell = New-Object -ComObject Shell.Application; $wins = $shell.Windows(); $target = $null; foreach ($w in $wins) { if ($w.HWND -eq $hwnd) { $target = $w; break } }; if ($null -eq $target) { [pscustomobject]@{ Ok=$false; Error='Window not found' } | ConvertTo-Json; exit }; $folder = $target.Document.Folder; $items = $folder.Items(); $counts = @{}; $total = 0; $known = @('jpg','jpeg','png','heic','gif','bmp','tiff','webp','mov','mp4','m4v','avi','mts','m2ts','3gp','mkv','aae'); foreach ($i in $items) { if (-not $i.IsFolder) { $name = $i.Name; if ($null -ne $name -and $name.Length -gt 0) { $ext = $null; try { $ext = [System.IO.Path]::GetExtension($name) } catch { $ext = $null }; if ($null -eq $ext -or $ext -eq '') { $m = [regex]::Match($name, '\\.([A-Za-z0-9]+)$'); if ($m.Success) { $ext = '.' + $m.Groups[1].Value } }; if ($null -ne $ext -and $ext.Length -gt 0) { $ext = $ext.Trim().ToLower().TrimStart('.'); if ($ext -ne '') { if (-not $counts.ContainsKey($ext)) { $counts[$ext] = 0 }; $counts[$ext] += 1; $total += 1 } } } } }; $media = @{}; $other = 0; foreach ($k in $counts.Keys) { if ($known -contains $k) { $media[$k] = $counts[$k] } else { $other += $counts[$k] } }; [pscustomobject]@{ Ok=$true; Folder=$folder.Self.Name; Path=$folder.Self.Path; Total=$total; Media=$media; Other=$other } | ConvertTo-Json -Depth 6`
	return new Promise(resolve => {
		exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, (error, stdout) => {
			if (error) {
				console.error('Count media in window failed:', error.message)
				resolve({ Ok: false, Error: error.message })
				return
			}
			try {
				if (!stdout || !stdout.trim()) {
					resolve({ Ok: false, Error: 'Empty output' })
					return
				}
				const data = JSON.parse(stdout)
				resolve(data)
			} catch (e) {
				console.error('Parse count media JSON failed:', e.message)
				resolve({ Ok: false, Error: e.message })
			}
		})
	})
})

// (Device detection removed) Explorer-only workflow

// IPC: Open DevTools
ipcMain.handle('open-dev-tools', async () => {
	const windows = BrowserWindow.getAllWindows()
	if (windows.length > 0) windows[0].webContents.openDevTools()
})

// IPC: Load config
ipcMain.handle('load-config', async () => {
	return loadConfig()
})

// IPC: Save config
ipcMain.handle('save-config', async (event, config) => {
	saveConfig(config)
	return { Ok: true }
})

// IPC: List folders in source Explorer window
ipcMain.handle('list-source-folders', async (event, srcHwnd) => {
	const ps = `$srcHwnd = ${Number(srcHwnd)}; $ErrorActionPreference='SilentlyContinue'; $shell = New-Object -ComObject Shell.Application; $wins = $shell.Windows(); $src = $null; foreach ($w in $wins) { if ($w.HWND -eq $srcHwnd) { $src = $w; break } }; if ($null -eq $src) { [pscustomobject]@{ Ok=$false; Error='Source window not found' } | ConvertTo-Json; exit }; $srcFolder = $src.Document.Folder; $items = $srcFolder.Items(); $folders = @(); foreach ($i in $items) { if ($i.IsFolder) { $folders += $i.Name } }; [pscustomobject]@{ Ok=$true; Folder=$srcFolder.Self.Name; Path=$srcFolder.Self.Path; Folders=$folders } | ConvertTo-Json -Depth 4`
	return new Promise(resolve => {
		exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, (error, stdout) => {
			if (error) {
				console.error('List source folders failed:', error.message)
				resolve({ Ok: false, Error: error.message })
				return
			}
			try {
				if (!stdout || !stdout.trim()) {
					resolve({ Ok: false, Error: 'Empty output' })
					return
				}
				const data = JSON.parse(stdout)
				resolve(data)
			} catch (e) {
				console.error('Parse source folders JSON failed:', e.message)
				resolve({ Ok: false, Error: e.message })
			}
		})
	})
})

// IPC: Count files in a specific folder
ipcMain.handle('count-files-in-folder', async (event, srcHwnd, folderName) => {
	const safeName = String(folderName || '').replace(/'/g, "''")
	const ps = `$srcHwnd = ${Number(srcHwnd)}; $folderName = '${safeName}'; $ErrorActionPreference='SilentlyContinue'; $shell = New-Object -ComObject Shell.Application; $wins = $shell.Windows(); $src = $null; foreach ($w in $wins) { if ($w.HWND -eq $srcHwnd) { $src = $w; break } }; if ($null -eq $src) { [pscustomobject]@{ Ok=$false; Error='Source window not found' } | ConvertTo-Json; exit }; $srcFolder = $src.Document.Folder; $items = $srcFolder.Items(); $targetFolderItem = $null; foreach ($i in $items) { if ($i.IsFolder -and ($i.Name.Trim() -ieq $folderName)) { $targetFolderItem = $i; break } }; if ($null -eq $targetFolderItem) { [pscustomobject]@{ Ok=$false; Error='Folder not found' } | ConvertTo-Json; exit }; $subFolder = $targetFolderItem.GetFolder; if ($null -eq $subFolder) { [pscustomobject]@{ Ok=$false; Error='Cannot access folder' } | ConvertTo-Json; exit }; $subItems = $subFolder.Items(); $count = 0; foreach ($i in $subItems) { if (-not $i.IsFolder) { $count += 1 } }; [pscustomobject]@{ Ok=$true; Count=$count } | ConvertTo-Json`
	return new Promise(resolve => {
		exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, (error, stdout) => {
			if (error) {
				resolve({ Ok: false, Error: error.message })
				return
			}
			try {
				const data = JSON.parse(stdout)
				resolve(data)
			} catch (e) {
				resolve({ Ok: false, Error: e.message })
			}
		})
	})
})

// IPC: Copy visible non-folder files from a specific folder in source Explorer window to destination Explorer window, one-by-one, waiting each copy to complete
ipcMain.handle('copy-folder-files-serial', async (event, srcHwnd, folderName, dstHwnd) => {
	const safeName = String(folderName || '').replace(/'/g, "''")
	const ps = `$srcHwnd = ${Number(srcHwnd)}; $dstHwnd = ${Number(dstHwnd)}; $folderName = '${safeName}'; $ErrorActionPreference='SilentlyContinue'; $shell = New-Object -ComObject Shell.Application; $wins = $shell.Windows(); $src = $null; $dst = $null; foreach ($w in $wins) { if ($w.HWND -eq $srcHwnd) { $src = $w } elseif ($w.HWND -eq $dstHwnd) { $dst = $w } }; if ($null -eq $src) { [pscustomobject]@{ Ok=$false; Error='Source window not found' } | ConvertTo-Json -Compress; exit }; if ($null -eq $dst) { [pscustomobject]@{ Ok=$false; Error='Destination window not found' } | ConvertTo-Json -Compress; exit }; $srcFolder = $src.Document.Folder; $items = $srcFolder.Items(); $targetFolderItem = $null; foreach ($i in $items) { if ($i.IsFolder -and ($i.Name.Trim() -ieq $folderName)) { $targetFolderItem = $i; break } }; if ($null -eq $targetFolderItem) { [pscustomobject]@{ Ok=$false; Error='Folder not found in source' } | ConvertTo-Json -Compress; exit }; $subFolder = $targetFolderItem.GetFolder; if ($null -eq $subFolder) { [pscustomobject]@{ Ok=$false; Error='Cannot access folder contents' } | ConvertTo-Json -Compress; exit }; $subItems = $subFolder.Items(); if ($null -eq $subItems) { [pscustomobject]@{ Ok=$false; Error='Cannot enumerate folder items' } | ConvertTo-Json -Compress; exit }; $dstFolder = $dst.Document.Folder; $dstPath = $dstFolder.Self.Path; if (-not $dstPath -or $dstPath.Length -eq 0) { [pscustomobject]@{ Ok=$false; Error='Destination path is not a filesystem path' } | ConvertTo-Json -Compress; exit }; $targetDstPath = Join-Path -Path $dstPath -ChildPath $folderName; if (-not (Test-Path -LiteralPath $targetDstPath)) { try { New-Item -Path $targetDstPath -ItemType Directory -Force | Out-Null } catch { [pscustomobject]@{ Ok=$false; Error="Cannot create destination folder: $($_.Exception.Message)" } | ConvertTo-Json -Compress; exit } }; $nsDst = $shell.NameSpace($targetDstPath); if ($null -eq $nsDst) { [pscustomobject]@{ Ok=$false; Error='Failed to open destination namespace' } | ConvertTo-Json -Compress; exit }; $copied = 0; $skipped = 0; $errors = @(); foreach ($i in $subItems) { if ($i.IsFolder) { continue }; $name = $i.Name; if (-not $name) { continue }; $size = $i.ExtendedProperty('System.Size'); if ($null -eq $size) { $size = 0 }; try { $nsDst.CopyHere($i, 16) } catch { $errors += "Copy failed: $name - $($_.Exception.Message)"; continue }; $target = Join-Path -Path $targetDstPath -ChildPath $name; $maxWaitMs = 600000; $sleepMs = 1000; $elapsed = 0; $appeared = $false; while ($elapsed -lt $maxWaitMs) { try { if (Test-Path -LiteralPath $target) { $appeared = $true; $fi = Get-Item -LiteralPath $target -ErrorAction SilentlyContinue; if ($fi -and $fi.Length -gt 0) { if ($size -gt 0) { if ([int64]$fi.Length -ge [int64]$size) { break } } else { if ($fi.Length -gt 0) { break } } } } } catch { }; Start-Sleep -Milliseconds $sleepMs; $elapsed += $sleepMs }; if ($appeared) { $copied += 1; Write-Host "PROGRESS:$($copied):$($name)" } else { $errors += "Timeout waiting copy: $name" } }; [pscustomobject]@{ Ok=$true; Copied=$copied; Skipped=$skipped; Errors=$errors; Src=$folderName; Dst=$targetDstPath } | ConvertTo-Json -Compress -Depth 6`
	return new Promise(resolve => {
		const child = exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, (error, stdout) => {
			if (error) {
				console.error('Copy files serial failed:', error.message)
				resolve({ Ok: false, Error: error.message })
				return
			}
			try {
				// Filter out PROGRESS lines and find JSON
				const lines = stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('PROGRESS:'))
				const jsonLine = lines.find(l => l.startsWith('{'))
				if (!jsonLine) {
					resolve({ Ok: false, Error: 'No JSON output' })
					return
				}
				const data = JSON.parse(jsonLine)
				resolve(data)
			} catch (e) {
				console.error('Parse copy files JSON failed:', e.message, 'stdout:', stdout)
				resolve({ Ok: false, Error: e.message })
			}
		})
		
		child.stdout.on('data', (data) => {
			const output = data.toString()
			const lines = output.split('\n')
			for (const line of lines) {
				if (line.startsWith('PROGRESS:')) {
					const parts = line.substring(9).split(':')
					if (parts.length >= 2) {
						const copied = parseInt(parts[0])
						const fileName = parts.slice(1).join(':')
						event.sender.send('copy-progress', { copied, fileName })
					}
				}
			}
		})
	})
})

