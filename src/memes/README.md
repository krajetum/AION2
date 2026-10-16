# Memes

Drop animated images (`.gif`, `.webp`, `.png`, `.jpg`) into these folders; they are picked up
automatically at the next `npm run dev` / build. One random image per folder is chosen at launch.

- `win/` — shown when every task of the current tab (Daily/Weekly/Monthly) is done
- `empty/` — shown in empty lists ("No tasks yet", "No news yet")
- `react/` — a random one pops up bottom-right for 1.5 s each time you check a task
  (sound: `public/sounds/check.wav`, falls back to `default.wav`; volume/mute in Settings → Notifications)
- `mascot/` — corner mascot (up to 200px bottom-left on wide windows, 56px next to the title otherwise);
  click it to hide, re-enable in Settings → System

An empty folder simply means no meme in that spot.
