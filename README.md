# SHAMEZO

"SHAMEZO" （写メゾー） is a web application for adding text overlays to images.

## Tech Stack

- **Framework**: Next.js 16
- **UI**: Tailwind CSS + shadcn/ui
- **Image Processing**: sharp + skia-canvas + heic-convert (server-side)
- **Language**: TypeScript

## Text Compositing

Generate composite images by overlaying text on images.

- **Text**: 1–140 characters
- **Supported Image Formats**: JPEG / PNG / WebP / HEIC / AVIF (up to 20MB)
- **Output Formats**: JPEG or AVIF

### Customization Options

| Option | Choices |
|--------|---------|
| Text Position | Top / Right / Left / Bottom |
| Font | Hui Font / Noto Sans JP / Light Novel POP |
| Text Color | White / Red / Blue / Green / Yellow / Brown / Pink / Orange |
| Size | Small / Medium / Large / Extra Large |
| Output Format | Mastodon (AVIF) / Misskey (AVIF) / None (JPEG) |

Font files are stored in a private repository to prevent license violations (redistribution).

### Text Rendering

- Width
   - Noto Sans JP: Rendered with proportional font width.
   - Hui Font / Light Novel POP: Rendered with monospace width. However, half-width alphanumeric characters are displayed at half width.
- Vertical Writing
   - Brackets (「」, （）, 【】, etc.) and prolonged sound marks (ー, 〜, etc.) are rotated 90 degrees instead of using vertical writing fonts.
   - Punctuation marks (、。) are aligned to the upper right.
- Text Outline
   - All text has outlines added for better visibility. Light colors (white, green, yellow, pink, orange) have black outlines, while dark colors (red, blue, brown) have white outlines.
- Font Size
   - Automatically calculated based on image size. The medium size is calibrated so that 16 characters fit within the shorter edge of the image.

## Posting Images

Images can be posted in three ways.

### Web Posting

Post directly from a web browser. Log in with a Mastodon / Misskey account and generate/post images from the posting page.

### Bot Posting (Mention)

Post by mentioning the bot account on Mastodon. The bot account is pre-configured and processes posts by periodically polling its mentions. Replies to the bot (containing the original unconverted image) are automatically deleted using the user's token to reduce the burden on server administrators.

Example:
```
@pic [上 赤 大] Hello
```

### Email Posting

Post via email. Specify options in the subject line, text in the body, and attach an image. Triggered via Cloudflare Workers.

- Subject: Options separated by spaces (e.g., "上 赤 大")
- Body: Text to overlay on the image
- Attachment: Image file

## User Interface

- "Like"
- User page (`/u/[username]`)
   - Pinning user post
   - Calendar view
- Public timeline (`/public/`)