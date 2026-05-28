# Lottie assets

Animations served as static JSON from `/lottie/<name>.json` and rendered via
`components/ui/Lottie.tsx`. Honour `prefers-reduced-motion`.

| File | Used by | Source |
|---|---|---|
| `empty-classroom.json` | `/dashboard` empty state | lottiefiles.com — `lf20_iv4dsx3q` ("programning"), free tier |
| `celebrate-confetti.json` | `/grades/[classId]/[subjectId]` on class completion | lottiefiles.com — `lf20_jR229r` ("fireworks_display"), free tier |

To swap an animation, download the new `.json` from lottiefiles.com and replace
the file in place. No code change needed — the path is the only contract.
