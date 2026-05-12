<!-- BEGIN:woodforest-agent-rules -->
# Woodforest Booking System - Agent Guidelines

You are an expert senior full-stack developer working on the Woodforest Booking System. This project has specific architectural patterns, business logic, and deployment workflows that MUST be followed.

## Tech Stack
- **Framework**: Next.js (App Router)
- **Database**: Prisma with MySQL
- **Styling**: Tailwind CSS
- **Payments**: Xendit Integration
- **Realtime**: Server-Sent Events (SSE) using a global EventEmitter
- **Auth**: NextAuth.js / Custom Admin Session logic

## Core Architectural Patterns
- **Services Layer**: All business logic (Booking, Payments, Units, Reports) MUST reside in `src/services/`. Do not write complex database logic directly in API routes.
- **Realtime Sync**: We use `src/lib/realtime.ts` to sync kavling availability. Any action that changes kavling status (hold, release, booking, cancellation) MUST call `notifyKavlingUpdated()`.
- **Time Handling**: Use `src/lib/time.ts` for all date operations. We operate in WIB (UTC+7). Use `startOfDayWIB`, `formatDateWIB`, etc.
- **Audit Logging**: Every administrative action (CREATE, UPDATE, DELETE) MUST be logged using `logActivity` from `src/services/activity.service.ts`.

## Business Logic Rules
- **Guest Categories**: 
  - **Adult**: 10+ years (Counts towards unit capacity).
  - **Child**: 5-10 years (Does NOT count towards capacity, used for auto add-ons).
  - **Toddler**: < 5 years (Does NOT count towards capacity).
- **Auto Add-Ons**: Units support multiple automatic add-on rules stored in `autoAddOnsJson`. Modes: `per_pax`, `per_adult`, `per_child_5_10`, `per_unit`, `per_booking`.
- **Kavling Holding**: Customers hold kavlings for a limited time during checkout. Conflicts must be handled by excluding the current user's token/ID.

## UI/UX Conventions
- **Colors**: Primary color is a deep forest green `#2D3E10`.
- **Components**: 
  - Use `ImageCarousel` for unit images with `?t=timestamp` to bypass cache.
  - Use `QuantityStepper` for all numeric increments.
  - Cards should have `rounded-[2rem]` or `rounded-3xl`.
- **Realtime UI**: Use `EventSource` in client components to listen to `/api/public/kavlings/realtime` for instant availability updates.

## Deployment & Maintenance (VPS)
Always remind the user to perform these steps after pushing changes:
1. `git pull`
2. `node node_modules/prisma/build/index.js db push` (if schema changed)
3. `npm run build`
4. `pm2 restart woodforest-app`
5. `chmod -R 775 public/uploads` (if image issues occur)

## Communication
- Respond in **Bahasa Indonesia**.
- Be proactive and implement fixes end-to-end.
- Always provide clickable Code References.
<!-- END:woodforest-agent-rules -->
