# Hournook: Production Readiness Report (QA audit)

Ημερομηνία: 28 Σεπτεμβρίου 2026 · Κώδικας: branch `claude/optimistic-brahmagupta-tgpz2s`

Όλα τα αποτελέσματα παρακάτω προέρχονται από τεστ που εκτελέστηκαν πραγματικά. Ό,τι δεν
μπόρεσε να ελεγχθεί σημειώνεται ως **NOT VERIFIED** με τον λόγο.

## Περιβάλλον δοκιμών (production safety)

- Όλα τα τεστ έτρεξαν σε **απομονωμένες τοπικές βάσεις** PostgreSQL 16 (`hournook_test`,
  `hournook_e2e`), που μηδενίζονται σε κάθε εκτέλεση. **Η παραγωγή (www.hournook.com) δεν
  αγγίχτηκε**: κανένας πραγματικός πελάτης, καμία χρέωση, κανένα email σε πραγματικό inbox.
- **Emails:** η εφαρμογή στέλνει μέσω του πραγματικού κώδικα Resend προς έναν τοπικό «ψεύτικο»
  Resend server (`tests/e2e/support/fake-resend.mjs`). Τα τεστ ανοίγουν κάθε email και πατάνε τα
  links του όπως ένας παραλήπτης.
- **Stripe:** ψεύτικο Stripe API (`tests/helpers/fake-stripe.ts`), γιατί το `api.stripe.com`
  είναι μπλοκαρισμένο από το δίκτυο του sandbox.
- **Browser:** Chromium (desktop 1280×800 και Pixel 7). Firefox/Safari δεν υπάρχουν στο
  περιβάλλον.

## EXECUTIVE SUMMARY

|                                        |                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unit + integration tests               | **770 passed**, 0 failed (44 αρχεία)                                                                              |
| E2E + accessibility tests (Playwright) | **135 passed**, 0 failed (desktop + mobile, WCAG A/AA σε light και dark)                                          |
| Bugs που βρέθηκαν σε αυτόν τον έλεγχο  | 5 (0 × P0, 1 × P1, 3 × P2, 1 × P3), **όλα διορθώθηκαν με regression test**                                        |
| Ανοιχτά P0/P1                          | 0                                                                                                                 |
| NOT VERIFIED                           | πραγματική παράδοση email σε inbox, Stripe checkout σε test mode, Safari/Firefox, σκανάρισμα QR με κάμερα κινητού |
| N/A (δεν υπάρχει στην εφαρμογή)        | ταμείο, πληρωμές ραντεβού, επιστροφές χρημάτων, έξοδα                                                             |

## 1. Application map (discovery)

**Δημόσιες σελίδες:** `/`, `/pricing`, `/support`, `/terms`, `/privacy`, `/dpa`, `/cookies`,
`/legal`, `/[slug]` (σελίδα κρατήσεων· τα παλιά `/book/[slug]` κάνουν ανακατεύθυνση), `/embed/[slug]` (widget), `/manage/[token]`
(διαχείριση κράτησης από τον πελάτη), `/manage/[token]/ics`.

**Λογαριασμός:** `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`,
`/invite/[token]`, `/onboarding`.

**Dashboard (`/app`):** αρχική, calendar (day/week/month/agenda), appointments (+ λεπτομέρειες),
customers (+ λεπτομέρειες), services, staff, availability, booking page, QR (`/app/qr`),
analytics, reports, billing, settings (business, booking, notifications, team, account, privacy &
data, activity), exports (CSV: appointments, customers, services, όλη η επιχείρηση).

**Admin (`/admin`):** businesses, audit, flags, health.

**API:** public availability / bookings / events, manage availability / cancel / reschedule,
Stripe webhook, cron tick, health.

**Emails:** επιβεβαίωση email, επαναφορά κωδικού, πρόσκληση μέλους, επιβεβαίωση/αίτημα κράτησης,
επιβεβαίωση από την επιχείρηση, αλλαγή ώρας, ακύρωση, υπενθυμίσεις (24 ώρες και 2 ώρες πριν),
ειδοποιήσεις προς την επιχείρηση, emails χρέωσης.

**Χρήματα:** η εφαρμογή **δεν** χειρίζεται πληρωμές ραντεβού. Υπάρχουν: τιμή ανά υπηρεσία,
«έσοδα» στα analytics (άθροισμα τιμών ολοκληρωμένων ραντεβού) και η συνδρομή €10/μήνα μέσω
Stripe. Ταμείο, συναλλαγές, επιστροφές, μερικές πληρωμές, έξοδα **δεν υπάρχουν** (N/A).

## 2. Critical E2E results

Σενάριο: `tests/e2e/qa-lifecycle.spec.ts` (μία επιχείρηση από την εγγραφή ως τη διαγραφή, μέσα
από το πραγματικό UI, με έλεγχο βάσης, emails και δημόσιας σελίδας σε κάθε βήμα).

| #       | Ροή                                  | Αποτέλεσμα                            | Τι ελέγχθηκε                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E #1  | Registration → Login → Setup         | **PASS**                              | Κενά πεδία, λάθος email, αδύναμος κωδικός, όροι χωρίς tick → σωστά μηνύματα, κανένας χρήστης στη βάση. Οι τιμές **μένουν** μετά από σφάλμα. Email με κενά/κεφαλαία κανονικοποιείται. Αποδοχή όρων καταγράφεται (έκδοση + ώρα). Email επιβεβαίωσης φτάνει στον provider **σε < 5 δευτερόλεπτα**, το link του λειτουργεί. Διπλή εγγραφή απορρίπτεται. Onboarding: επιχείρηση, 2 υπηρεσίες (€50.00 / €19.99 αποθηκεύονται ακριβώς σε λεπτά), ωράριο, δημοσίευση. |
| E2E #2  | Publish → QR → Public page           | **PASS**                              | Το PNG του QR **αποκωδικοποιήθηκε** (jsQR) και οδηγεί ακριβώς στο `/book/<slug>?src=qr`. SVG και download λειτουργούν. Ανώνυμος χρήστης δεν παίρνει QR.                                                                                                                                                                                                                                                                                                       |
| E2E #3  | Public page → Booking → Admin        | **PASS**                              | Ανώνυμος πελάτης με ελληνικό όνομα κλείνει από το QR link· διπλό κλικ στο «Confirm» δημιουργεί **ένα** ραντεβού· σωστή τιμή, διάρκεια 60΄, πηγή `qr`.                                                                                                                                                                                                                                                                                                         |
| E2E #4  | Booking → Appointment → Availability | **PASS**                              | Η κλεισμένη ώρα φεύγει από τη διαθεσιμότητα· δεύτερη κράτηση στην ίδια ώρα μέσω API → **409**, κανένα διπλό ραντεβού.                                                                                                                                                                                                                                                                                                                                         |
| E2E #5  | Appointment → Payment → Cash         | **PASS (έσοδα)** / **N/A (ταμείο)**   | Ολοκληρωμένα €50.00 + €19.99 = **€69.99** (ανεξάρτητος υπολογισμός στη βάση και ίδιο ποσό στο UI)· ακυρωμένο ραντεβού δεν μετράει· μετά από Reopen → No-show τα έσοδα γίνονται **€50** (βάση + UI). Ταμείο/πληρωμές δεν υπάρχουν στην εφαρμογή.                                                                                                                                                                                                               |
| E2E #6  | Cancellation → Availability          | **PASS**                              | Ακύρωση από το link του email με ελληνική αιτιολογία· status `cancelled`· η ώρα ξαναγίνεται διαθέσιμη· email ακύρωσης στον πελάτη και ειδοποίηση στην επιχείρηση.                                                                                                                                                                                                                                                                                             |
| E2E #7  | Rescheduling → Availability          | **PASS**                              | Αλλαγή ώρας από το link του email· η παλιά ώρα ελευθερώνεται, η νέα πιάνεται· `rescheduleCount = 1`· email αλλαγής.                                                                                                                                                                                                                                                                                                                                           |
| E2E #8  | Appointment → Email / Notification   | **PASS**                              | Επιβεβαίωση στον πελάτη (ένα email, όχι διπλό), ειδοποίηση στην επιχείρηση, emails αλλαγής/ακύρωσης: κανένα `undefined`/`null`/`NaN`, σωστός αποστολέας.                                                                                                                                                                                                                                                                                                      |
| E2E #9  | Settings → Persistence               | **PASS**                              | «Book up to: 1 week» → μένει μετά από refresh **και** logout/login· η δημόσια διαθεσιμότητα σε 14 μέρες είναι πράγματι κενή. Παύση υπηρεσίας → εξαφανίζεται από τη δημόσια σελίδα. Αποσύνδεση → το `/app` ζητά login.                                                                                                                                                                                                                                         |
| E2E #10 | Account deletion lifecycle           | **PASS** (μετά τη διόρθωση του BUG-2) | Ακύρωση του διαλόγου δεν σβήνει τίποτα· διαγραφή επιχείρησης → 0 γραμμές σε businesses/appointments/customers/services, δημόσια σελίδα 404, το link διαχείρισης κράτησης δείχνει ασφαλές μήνυμα· διαγραφή λογαριασμού με κωδικό → ο χρήστης σβήνεται, το login αποτυγχάνει.                                                                                                                                                                                   |

Επιπλέον E2E σε αυτόν τον έλεγχο: πλήρης επαναφορά κωδικού μέσω του link του email (λάθος link
απορρίπτεται, το link λειτουργεί μία φορά, ο παλιός κωδικός σταματά, ο νέος δουλεύει), και
μακρύ email στη σελίδα κράτησης σε 1920px, 1280px και κινητό.

## 3. Feature coverage

| Feature               | Tested | Result                            | Notes                                                                                 |
| --------------------- | ------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| Authentication        | ✔      | PASS                              | sessions, HttpOnly/SameSite cookie, throttling αποτυχημένων logins (E2E security)     |
| Registration          | ✔      | PASS                              | μετά τη διόρθωση του BUG-1                                                            |
| Login / Logout        | ✔      | PASS                              | λάθος κωδικός, γενικό μήνυμα, logout → προστατευμένες σελίδες ζητούν login            |
| Password reset        | ✔      | PASS                              | email link, μία χρήση, tampered token, ο παλιός κωδικός απορρίπτεται                  |
| Account               | ✔      | PASS                              | προφίλ/αλλαγή κωδικού: integration tests· διαγραφή: E2E #10                           |
| Settings              | ✔      | PASS                              | booking rules με πραγματική επίδραση· notifications, team, privacy: integration       |
| Dashboard             | ✔      | PASS                              | λίστα ραντεβού, calendar views, command palette (E2E dashboard)                       |
| Appointments          | ✔      | PASS                              | χειροκίνητο ραντεβού, complete/no-show/reopen/cancel, κανόνες μεταβάσεων              |
| Booking (public)      | ✔      | PASS                              | πλήρης ροή, validation, honeypot, πληκτρολόγιο μόνο, slot που πιάστηκε στο μεταξύ     |
| Cancellation          | ✔      | PASS                              | πελάτης (link) και επιχείρηση· προθεσμίες                                             |
| Rescheduling          | ✔      | PASS                              | πελάτης (link) και επιχείρηση· conflict detection                                     |
| Availability engine   | ✔      | PASS                              | 34 unit tests (buffers, κλεισίματα, ειδικό ωράριο, ζώνες ώρας/DST) + E2E              |
| Services              | ✔      | PASS                              | create/edit/pause/delete, δεκαδικές τιμές, επίδραση στη δημόσια σελίδα                |
| Customers             | ✔      | PASS                              | ιστορικό (ακυρωμένο + ενεργό), ένας πελάτης όχι διπλός, GDPR erasure (integration)    |
| Email                 | ✔      | PASS*                             | *μέχρι τον provider· η παράδοση σε πραγματικό inbox είναι NOT VERIFIED                |
| QR Code               | ✔      | PASS                              | αποκωδικοποίηση PNG, SVG, download, μόνο για owner                                    |
| Publish / Unpublish   | ✔      | PASS                              | unpublish → 404 και booking API 404· republish → ίδιο URL                             |
| Money / Revenue       | ✔      | PASS                              | ακρίβεια δεκαδικών (€69.99), no-show/ακυρωμένα εκτός                                  |
| Cash / Tamio          | —      | N/A                               | δεν υπάρχει στην εφαρμογή                                                             |
| Payments (ραντεβού)   | —      | N/A                               | οι πελάτες πληρώνουν την επιχείρηση εκτός εφαρμογής                                   |
| Subscription (Stripe) | ✔      | PASS (fake) / NOT VERIFIED (real) | 23 integration tests με ψεύτικο Stripe· πραγματικό test-mode checkout δεν εκτελέστηκε |
| Notifications         | ✔      | PASS                              | outbox, retries, υπενθυμίσεις μία φορά, όχι σε ακυρωμένα                              |
| Permissions           | ✔      | PASS                              | ξένα ραντεβού/πελάτες με URL → όχι, exports μόνο δικά σου, admin 404 για μη-admin     |
| Mobile                | ✔      | PASS                              | overflow σε 320–1920px, ροές @mobile σε Pixel 7                                       |
| Accessibility         | ✔      | PASS                              | axe WCAG A/AA σε όλες τις σελίδες, light και dark                                     |
| Browsers              | ◐      | NOT VERIFIED                      | μόνο Chromium διαθέσιμο εδώ                                                           |

## 4. Bugs found in this audit

### BUG-1 · P2 · Registration form wiped input on error

- **Steps:** `/signup` → συμπλήρωσε όνομα, λάθος email, κωδικό, tick → «Create account».
- **Expected:** εμφανίζεται το σφάλμα και μένουν όσα γράφτηκαν.
- **Actual:** όνομα, email και το tick των όρων σβήνονταν (το React 19 κάνει reset στις φόρμες
  με action).
- **Impact:** εκνευρισμός και εγκατάλειψη στην εγγραφή.
- **Fix:** ελεγχόμενα πεδία, και υποβολή χωρίς αυτόματο reset όταν υπάρχει JavaScript (η φόρμα
  δουλεύει και χωρίς JS). Ίδια διόρθωση στο login και στο «ξέχασα τον κωδικό».
- **Regression:** E2E #1 ελέγχει ρητά ότι οι τιμές μένουν. **FIXED**

### BUG-2 · P1 · A user without a business could not delete the account (or sign out)

- **Steps:** διάγραψε την επιχείρηση → άνοιξε ρυθμίσεις λογαριασμού.
- **Expected:** ο χρήστης μπορεί να διαγράψει τον λογαριασμό του (δικαίωμα διαγραφής, GDPR).
- **Actual:** ανακατεύθυνση στο onboarding χωρίς επιλογή διαγραφής ή αποσύνδεσης· η action
  απαιτούσε επιχείρηση.
- **Fix:** η διαγραφή λογαριασμού χρειάζεται μόνο σύνδεση· μενού «Account» στο onboarding με
  Sign out και Delete account.
- **Regression:** E2E #10 και το τεστ επαναφοράς κωδικού. **FIXED**

### BUG-3 · P2 · Sign-up email could be lost on a temporary provider error

- **Actual:** αν ο provider απαντούσε 429/5xx/timeout, το email επιβεβαίωσης χανόταν χωρίς
  επανάληψη· επίσης το Gmail «έκρυβε» νέα emails επιβεβαίωσης μέσα σε παλιά συνομιλία.
- **Fix:** 2 επαναλήψεις μέσα στο ίδιο αίτημα (0,4 s και 1,2 s), μοναδικό `X-Entity-Ref-ID` ανά
  email, `Reply-To` στην υποστήριξη, καταγραφή χρόνου αποστολής στα logs (`email.account.sent`).
- **Regression:** `tests/integration/email-delivery.test.ts` (10 τεστ). **FIXED**

### BUG-4 · P3 · Long email overflowed the contact card on the booking page

- **Evidence:** το screenshot σου (1920px)· το νέο τεστ αποτυγχάνει χωρίς τη διόρθωση και περνάει
  με αυτή.
- **Fix:** αναδίπλωση οπουδήποτε για emails/URLs. **FIXED**

### BUG-5 · P2 · Retention did not match the privacy policy

- **Actual:** το αρχείο ασφαλείας (με IP) και τα account emails κρατιούνταν για πάντα.
- **Fix:** IP σβήνονται σε 180 μέρες, εγγραφές σε 2 χρόνια, account emails σε 180 μέρες.
- **Regression:** `tests/integration/maintenance.test.ts`. **FIXED**

## 5. NOT VERIFIED (and why)

| Θέμα                                 | Γιατί                                               | Πώς το ελέγχεις εσύ στην παραγωγή                                                                   |
| ------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Παράδοση email σε πραγματικό inbox   | το δίκτυο του sandbox μπλοκάρει το `api.resend.com` | Εγγραφή με το email σου· στο Resend → Emails δες «Sent» και «Delivered» και πόσα δευτερόλεπτα πήρε. |
| Stripe checkout (test mode)          | μπλοκαρισμένο `api.stripe.com`                      | Billing → Subscribe με κάρτα `4242 4242 4242 4242`.                                                 |
| Safari / Firefox / πραγματικό iPhone | μόνο Chromium εδώ                                   | Άνοιξε το site σε iPhone (Safari) και κάνε μια κράτηση.                                             |
| QR με κάμερα κινητού                 | δεν υπάρχει κάμερα· αποκωδικοποιήθηκε με λογισμικό  | Σκάναρε τον QR από το dashboard με το κινητό.                                                       |
| Φόρτος / πολλοί ταυτόχρονοι χρήστες  | δεν ζητήθηκε load test                              | —                                                                                                   |

## 6. Final verdict

## PRODUCTION READINESS STATUS: **NOT VERIFIED**

Όλα τα κρίσιμα workflows που **ελέγχθηκαν** πέρασαν, και δεν υπάρχουν ανοιχτά P0/P1. Σύμφωνα
με τους κανόνες του ελέγχου όμως, η πραγματική παράδοση emails, το Stripe checkout και οι
browsers εκτός Chromium δεν μπόρεσαν να ελεγχθούν εδώ. Γι' αυτό το status είναι NOT VERIFIED
και όχι READY. Τα 4 σημεία του πίνακα 5 ελέγχονται σε 10 λεπτά στην παραγωγή.

## 7. Final checklist

- [x] Authentication · Registration · Login · Logout · Password reset
- [x] Account settings · Account deletion
- [x] Dashboard · Settings · Services · Customers · Appointments
- [x] Booking · Availability · Cancellation · Rescheduling
- [ ] Payments · Cash/Tamio · Transactions: **N/A**, δεν υπάρχουν στην εφαρμογή
- [x] Money (revenue): αριθμητικά επαληθευμένο
- [x] Emails (μέχρι τον provider) · Notifications
- [x] QR codes · Publish · Public page
- [x] CRUD · Search/filters (integration) · Navigation · Permissions
- [x] Persistence · Refresh · Logout/Login
- [x] Mobile · Accessibility · Error handling · Loading/duplicate submissions
- [x] Date/time (ζώνες ώρας, DST, ίδια ώρα σε πελάτη, email και επιχείρηση)
- [x] Cross-feature consistency · Full E2E business scenario · Regression testing
- [x] Production safety (καμία ενέργεια στην παραγωγή)

## 8. Τελικές εκτελέσεις (στον κώδικα που ανεβαίνει)

| Έλεγχος                                                     | Αποτέλεσμα                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | καθαρά                                                                                                                    |
| Unit + integration (`vitest`)                               | 770 / 770 passed                                                                                                          |
| E2E + accessibility (`playwright`)                          | 135 / 135 passed (7,7 λεπτά)                                                                                              |
| Production build                                            | επιτυχές, χωρίς warnings                                                                                                  |
| Lighthouse desktop                                          | Performance 99–100 · Accessibility 100 · Best Practices 100                                                               |
| Lighthouse mobile                                           | Performance 79–84 · Accessibility 100 σε 8 από 9 μετρήσεις (η 9η «έπιασε» στοιχείο στη μέση fade-in) · Best Practices 100 |

Το SEO στο Lighthouse βγαίνει 66 τοπικά μόνο επειδή κάθε host εκτός του www.hournook.com
παίρνει σκόπιμα `noindex`. Στο πραγματικό domain είναι 100.
