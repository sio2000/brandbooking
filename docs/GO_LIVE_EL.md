# Οδηγός για production (τι μένει από εσάς)

Όλα τα βήματα με τη σειρά. Κανένας κωδικός δεν υπάρχει σε αυτό το αρχείο ή στο repo: οι τιμές
μπαίνουν μόνο στο Netlify. **ΑΠΑΡΑΙΤΗΤΟ** = πρέπει να γίνει, **ΠΡΟΤΕΙΝΕΤΑΙ** = καλό να γίνει.

## Α. Τώρα, πριν από τη δοκιμή με την κάρτα 4242

1. **ΑΠΑΡΑΙΤΗΤΟ.** Netlify → Project configuration → Environment variables: διαγράψτε ολόκληρες
   τις `ADMIN_BOOTSTRAP_PASSWORD` και `ADMIN_BOOTSTRAP_EMAIL`. Ο λογαριασμός admin υπάρχει ήδη και ο
   κωδικός σας δεν αλλάζει πια σε κανένα deploy, αλλά κωδικός δεν πρέπει να μένει σε μεταβλητή.
   Αν τον ξεχάσετε: «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης.
2. **ΠΡΟΤΕΙΝΕΤΑΙ.** Διαγράψτε και την `PLATFORM_ADMIN_EMAILS`: ο `devtaskhub@gmail.com` είναι ήδη
   admin μέσα στη βάση.
3. **ΑΠΑΡΑΙΤΗΤΟ.** Netlify → λίστα Projects: αν υπάρχουν και άλλα projects του ίδιου site (π.χ.
   `thunderous-crisp-451223`, `candid-gumption-8f9a89`), διαγράψτε τα ή αποσυνδέστε τα από το
   GitHub. Κάθε push τα ξαναχτίζει, τρέχουν migrations και γράφουν webhooks στο Stripe σας. Αν
   χρησιμοποιούν την ίδια βάση, τα δεδομένα σας επηρεάζονται. Ο κώδικας πλέον προστατεύει το κλειδί
   του webhook του www, αλλά αυτά τα projects δεν χρειάζονται.
4. **ΑΠΑΡΑΙΤΗΤΟ.** Stripe (Test mode) → Developers → Webhooks: κρατήστε **μόνο** το
   `https://www.hournook.com/api/stripe/webhook`. Διαγράψτε τα `*.netlify.app` endpoints
   (`nimble-bavarois-d7ad4c`, `thunderous-crisp-451223`, `candid-gumption-8f9a89`). Μην αγγίξετε
   τιμές (prices) ή προϊόντα Hournook.
5. **ΑΠΑΡΑΙΤΗΤΟ, έλεγχος πλάνων:**
   - **Neon → Billing.** Αν είστε στο **Free**, περάστε στο **Launch** (περίπου 19–20 $/μήνα) πριν
     από τους πελάτες. Ο χρονοπρογραμματιστής (υπενθυμίσεις, emails) τρέχει κάθε λεπτό και κρατά τη
     βάση συνέχεια ξύπνια. Οι 100 ώρες του Free τελειώνουν γύρω στη 17η μέρα του μήνα και τότε
     **όλο το site σταματά** μέχρι τον επόμενο μήνα. Το Launch δίνει και αντίγραφα ασφαλείας 7
     ημερών. Βάλτε autoscaling 0,25–1 CU και ειδοποίηση δαπάνης (π.χ. 30 $).
   - **Netlify → Usage/Billing.** Αν είστε στο νέο δωρεάν πλάνο με credits (300 το μήνα), ο
     χρονοπρογραμματιστής καταναλώνει περίπου όσα credits έχει ο μήνας και το Netlify παγώνει το
     site όταν τελειώσουν: χρειάζεται πληρωμένο πλάνο. (Εναλλακτικά μπορώ να τον κάνω να τρέχει
     κάθε 15 λεπτά, με υπενθυμίσεις έως 15 λεπτά αργότερα.)
6. **ΑΠΑΡΑΙΤΗΤΟ.** Ο λογαριασμός της επιχείρησής σας `xsiwzos@gmail.com` είναι «Unverified» και δεν
   μπορεί να δημοσιεύσει τη σελίδα κρατήσεων. Συνδεθείτε ως xsiwzos → μπλε μπάρα επάνω →
   «Επαναποστολή συνδέσμου» → ανοίξτε το email (ελέγξτε και τα Ανεπιθύμητα). Ή: `/admin/users` →
   xsiwzos → «Verify email». Μετά δημοσιεύστε το IATREIO.
7. **ΠΡΟΤΕΙΝΕΤΑΙ.** Στο `/admin/businesses` δείτε τη μία δημοσιευμένη επιχείρηση
   (theocharispanagiotissiozos@gmail.com). Αν είναι δοκιμαστική, αποδημοσιεύστε τη ή κλείστε την
   ευρετηρίαση (Σελίδα κρατήσεων → SEO), αλλιώς θα μπει στο Google.

## Β. Η δοκιμή με την κάρτα 4242 (test mode, στο πραγματικό site)

Κάντε τη **συνδεδεμένοι ως xsiwzos** (ο admin δεν έχει επιχείρηση· καλύτερα σε ιδιωτικό παράθυρο).

1. Μενού **«Χρέωση»** → **«Συνδρομή με 10 €/μήνα»** → σελίδα του Stripe → κάρτα
   `4242 4242 4242 4242`, λήξη π.χ. 12/34, CVC 123, οποιαδήποτε διεύθυνση.
2. Αν η επιχείρηση είναι ακόμα σε δωρεάν δοκιμή, το Stripe γράφει «Total due today €0.00» και το
   κουμπί «Start trial». Είναι σωστό: οι μέρες δοκιμής μεταφέρονται και τα 10 € χρεώνονται όταν
   λήξει η δοκιμή. Στη «Χρέωση» θα δείτε «Συνδρομητής» / «Έχετε συνδρομή», «VISA •••• 4242» και ένα
   τιμολόγιο 0 €.
3. **Για να δείτε πραγματική χρέωση 10 € (test):** πριν πατήσετε Συνδρομή, στο Neon → SQL Editor:

   ```sql
   UPDATE businesses SET trial_ends_at = now() - interval '1 minute'
   WHERE id IN (SELECT bm.business_id FROM business_members bm
                JOIN users u ON u.id = bm.user_id
                WHERE u.email = 'xsiwzos@gmail.com' AND bm.role = 'owner');
   ```

   Τότε το Stripe γράφει «Total due today €10.00» και μετά την πληρωμή βλέπετε «Ενεργή», «Η συνδρομή
   σας είναι ενεργή», τιμολόγιο 10 € «Εξοφλημένο». Στο `/admin`: Paying 1, MRR €10.

4. **Ο έλεγχος που μετράει:** Stripe (Test) → Developers → Webhooks → το endpoint του
   www.hournook.com → Event deliveries: **όλα 200**. (Το `/admin/health` δεν δείχνει απορρίψεις
   υπογραφής, οπότε κοιτάτε το Stripe.) Αν δείτε 400 ή 503, σταματήστε και στείλτε μου screenshot.
5. «Διαχείριση χρέωσης» → Cancel subscription: βλέπετε «Η συνδρομή σας λήγει: …».
6. Μετά: `/admin/businesses` → IATREIO → «Cancel subscription» → Now, και «Extend trial» όσες μέρες
   θέλετε.

Το Stripe δεν στέλνει αποδείξεις σε test mode (ούτε για 0 €). Το email «Η συνδρομή σας στο Hournook
είναι ενεργή» είναι του Hournook και έρχεται κανονικά.

## Γ. Stripe LIVE Dashboard (ρυθμίσεις, χωρίς κώδικα)

1. **Settings → Business → Public details:** όνομα «Hournook», website `https://www.hournook.com`,
   email/τηλέφωνο υποστήριξης, privacy `https://www.hournook.com/privacy`, terms
   `https://www.hournook.com/terms`, statement descriptor π.χ. `HOURNOOK`, λογότυπο. Στο test mode
   εμφανίζεται «Devtaskhub sandbox». Επειδή ο λογαριασμός Stripe εξυπηρετεί και το Yesvelope, αυτές
   οι ρυθμίσεις ισχύουν και για τα δύο. **ΠΡΟΤΕΙΝΕΤΑΙ** ξεχωριστός λογαριασμός Stripe μόνο για το
   Hournook.
2. **Settings → Billing → Customer emails:** emails επιτυχημένων πληρωμών ON (αποφασίστε με το
   Workadu ποιος στέλνει το τιμολόγιο, για να μη λαμβάνει ο πελάτης δύο).
3. **Revenue recovery → Retries:** Smart Retries περίπου 2 εβδομάδες και μετά «cancel the
   subscription».
4. **Customer portal:** η εφαρμογή φτιάχνει δικό της portal για το Hournook (δεν χρησιμοποιεί το
   προεπιλεγμένο του λογαριασμού) με ακύρωση στο τέλος της περιόδου, αλλαγή κάρτας και ιστορικό
   τιμολογίων. Δεν χρειάζεται ρύθμιση.
5. **ΦΠΑ:** μην ορίσετε `STRIPE_AUTOMATIC_TAX`. Ο πελάτης χρεώνεται πάντα 10,00 € και το Workadu
   εκδίδει το παραστατικό (8,06 € + ΦΠΑ 24% 1,94 €) προς myAADE.
6. **Workadu:** συνδέστε τον **live** λογαριασμό Stripe, live webhook ενεργό, σειρά παραστατικών με
   ΦΠΑ 24% συμπεριλαμβανόμενο, διαβίβαση myAADE. Ελέγξτε πώς βγαίνουν πιστωτικά για επιστροφές.
7. Αντιγράψτε το live secret key (`sk_live_…`).

## Δ. Μετάβαση σε live (μία φορά, σε ήσυχη ώρα)

1. **ΠΡΟΤΕΙΝΕΤΑΙ.** Neon → Branches → Create branch από τη βάση production «now» (στιγμιαίο
   αντίγραφο ασφαλείας).
2. **ΑΠΑΡΑΙΤΗΤΟ.** Netlify → Environment variables:
   - `STRIPE_SECRET_KEY` → Edit → «Different value for each deploy context»: **Production** =
     `sk_live_…` (χωρίς κενά ή εισαγωγικά). Όλα τα άλλα contexts = το σημερινό `sk_test_…`.
   - Νέα μεταβλητή `STRIPE_LIVE_MODE` = `enabled` (πεζά), **All scopes** (πρέπει να περιλαμβάνει
     Builds και Functions), context **Production**. Χωρίς αυτή το build σταματά μόνο του με σαφές
     μήνυμα και το site μένει στην προηγούμενη έκδοση.
   - **Να μην υπάρχουν:** `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
     `STRIPE_PORTAL_CONFIGURATION_ID`, `STRIPE_AUTOMATIC_TAX`, `STRIPE_API_BASE`.
   - **Ποτέ** μην αλλάξετε το `APP_SECRET`.
3. **ΑΠΑΡΑΙΤΗΤΟ.** Neon → SQL Editor: `DELETE FROM subscriptions;` (όλες οι συνδρομές ως τώρα
   είναι δοκιμαστικές· χωρίς αυτό, όποιος έχει ξεκινήσει δοκιμαστικό checkout θα έπαιρνε σφάλμα
   «No such customer» στο live). Από εδώ μέχρι το βήμα 5 κανείς δεν πατά «Συνδρομή».
4. **ΑΠΑΡΑΙΤΗΤΟ.** Netlify → Deploys → Trigger deploy → **Deploy project**.
5. **ΑΠΑΡΑΙΤΗΤΟ.** Όταν γίνει «Published», ανοίξτε το log του build. Πρέπει να περιέχει:
   - `[hournook] site URL for links, emails and the Stripe webhook: https://www.hournook.com`
   - `[stripe:setup] Stripe live mode`
   - `[stripe:setup] stripe.price_id: stored id is from the other Stripe mode, re-provisioning`
     (και το ίδιο για `stripe.portal_configuration_id`). Είναι αναμενόμενα, δεν είναι σφάλματα.
   - `[stripe:setup] plan price: price_…`
   - `[stripe:setup] portal configuration: bpc_…`
   - `[stripe:setup] webhook created: we_… → https://www.hournook.com/api/stripe/webhook`

   Αν το build αποτύχει, το site μένει στην προηγούμενη έκδοση. Στείλτε μου το log.

6. **ΑΠΑΡΑΙΤΗΤΟ.** Stripe **LIVE**: προϊόν «Hournook» με τιμή 10,00 € EUR μηνιαία, tax behaviour
   «inclusive»· Developers → Webhooks: το endpoint του www.hournook.com με 9 events.

## Ε. Πρώτη πραγματική αγορά 10 € και επιστροφή

1. Neon: το ίδιο `UPDATE … trial_ends_at …` της ενότητας Β.3 για το IATREIO (αλλιώς χρεώνει 0 €).
2. Ως xsiwzos → «Χρέωση» → «Συνδρομή με 10 €/μήνα» → πραγματική κάρτα (θα ζητηθεί 3-D Secure).
3. Έλεγχος: Stripe live → Payments 10,00 € Succeeded· Webhooks όλα 200· στην εφαρμογή «Ενεργή»·
   η σελίδα κρατήσεων δέχεται μια δοκιμαστική κράτηση· το Workadu έβγαλε παραστατικό στο myAADE.
4. Stripe → η πληρωμή → **Refund** 10,00 € **και** η συνδρομή → **Cancel → Immediately** (η
   επιστροφή μόνη της δεν ακυρώνει τη συνδρομή). Πιστωτικό στο Workadu αν δεν βγήκε αυτόματα.
5. Βάλτε το IATREIO ξανά σε ενεργή κατάσταση: `/admin/businesses` → IATREIO → «Extend trial».
6. Stripe **Test** mode → Webhooks: διαγράψτε πλέον και το test endpoint του www.hournook.com.

## Ζ. Πριν έρθουν πολλοί πελάτες (ΠΡΟΤΕΙΝΕΤΑΙ)

1. Netlify → Project configuration → Build & deploy → Continuous deployment → Branches and deploy
   contexts: **Deploy previews = None**, **Branch deploys = μόνο το production branch**. Σήμερα κάθε
   preview τρέχει στη βάση production.
2. Ειδοποιήσεις σφαλμάτων: Slack incoming webhook στη μεταβλητή `ERROR_WEBHOOK_URL` (Production),
   και δωρεάν uptime monitor (π.χ. UptimeRobot) στο `https://www.hournook.com/api/health`.
3. Resend → Domains: το `hournook.com` «Verified». Προσθέστε DMARC: TXT `_dmarc.hournook.com` με τιμή
   `v=DMARC1; p=none; rua=mailto:devtaskhub@devtaskhub.com`.
4. Ταχύτητα βάσης: το «Database latency Slow» στο `/admin/health` δείχνει ότι οι functions του
   Netlify και το Neon είναι σε διαφορετική ήπειρο. Δεν χαλάει τίποτα· διορθώνεται βάζοντάς τα στην
   ίδια περιοχή (Netlify → Functions region, σε πληρωμένο πλάνο, ή νέο project Neon στην περιοχή
   του Netlify).
5. Ο δικηγόρος να διαβάσει την ελληνική μετάφραση (`/el/terms`, `/el/privacy`, `/el/dpa`).

## Η. Google Search Console (sitemap)

1. Ελέγξτε πρώτα στο browser:
   - `https://www.hournook.com/robots.txt` πρέπει να δείχνει `Allow: /` και στο τέλος
     `Sitemap: https://www.hournook.com/sitemap.xml`. Αν δείχνει μόνο `Disallow: /`, η μεταβλητή
     `APP_URL` δεν είναι ακριβώς `https://www.hournook.com`: διορθώστε και κάντε deploy.
   - `https://www.hournook.com/sitemap.xml`: λίστα με περίπου 120 διευθύνσεις.
   - `http://hournook.com/pricing` πρέπει να καταλήγει στο `https://www.hournook.com/pricing`
     (Netlify → Domain management: `www.hournook.com` = Primary domain).
2. `https://search.google.com/search-console` → Add property → αριστερό κουτί **Domain** → γράψτε
   `hournook.com` (χωρίς https και www). Καλύπτει www, χωρίς www, http και https μαζί.
3. Επαλήθευση: η Google δίνει μια τιμή `google-site-verification=…`. Προσθέστε εγγραφή **TXT** στο DNS
   του hournook.com (Netlify DNS → Add new record, ή στον πάροχο του domain): Name `@` (ή κενό),
   Value αυτή η τιμή. Μην σβήσετε άλλες TXT (π.χ. του Resend). Πατήστε Verify· αν δεν βρεθεί,
   ξαναδοκιμάστε σε 15–60 λεπτά. Αφήστε την εγγραφή μόνιμα.
4. **Indexing → Sitemaps → Add a new sitemap:** `https://www.hournook.com/sitemap.xml` → Submit. Αν
   υπάρχει παλιό sitemap με άλλη διεύθυνση (χωρίς www ή `*.netlify.app`), ανοίξτε το → ⋮ → Remove
   sitemap. Αναμενόμενο: «Success» και περίπου 120 σελίδες (8 σελίδες × 15 γλώσσες), συν τις
   σελίδες κρατήσεων που δημοσιεύονται με ευρετηρίαση ανοιχτή· αυτές μπαίνουν μόνες τους.
5. **URL Inspection** (πάνω μπάρα): για `https://www.hournook.com/`, `/el`, `/pricing`,
   `/el/pricing` → «Test live URL» → πρέπει να λέει «URL is available to Google» → «Request
   indexing» (περίπου 10 τη μέρα· τα υπόλοιπα τα βρίσκει από το sitemap).
6. Μετά από περίπου μία εβδομάδα, Indexing → Pages. **Αναμενόμενα και σωστά:** «Page with redirect»
   (διευθύνσεις χωρίς www, τα παλιά `/book/…`, `/en`), «Alternate page with proper canonical tag»
   (π.χ. `?lang=`, `?src=qr`), «Excluded by noindex» (σελίδες σύνδεσης, `*.netlify.app`),
   «Blocked by robots.txt» (`/app`, `/admin`, `/api` κ.λπ.). **Ανησυχητικά** (στείλτε μου
   screenshot): «Blocked by robots.txt» στο `/`, `/el` ή `/pricing`, ή «Submitted URL marked
   noindex».
7. Γλώσσες: δεν χρειάζεται καμία ρύθμιση. Τα hreflang για 15 γλώσσες υπάρχουν στο sitemap και σε
   κάθε σελίδα, και η Google τα διαβάζει μόνη της. Μην φτιάξετε ξεχωριστό property ανά γλώσσα.
8. Προαιρετικά: Bing Webmaster Tools → «Import from Google Search Console».

## Links κρατήσεων

Οι σελίδες κρατήσεων είναι `www.hournook.com/<όνομα>`. Τα παλιά links `www.hournook.com/book/<όνομα>`
(και τα τυπωμένα QR) ανακατευθύνονται μόνιμα, κρατώντας τις παραμέτρους (π.χ. `?src=qr`,
`?lang=el`).
