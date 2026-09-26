<div style="text-align: center;">
<img src="assets/icon/icon.png" width="110" height="110" alt="icon image">

# pronoteTs

Full TypeScript port of [pronotepy](https://github.com/bain3/pronotepy) - an unofficial PRONOTE API client.
Same protocol, same encryption (RSA-1024 + AES-128-CBC), same data model, same ENT/SSO providers. Built for Node.js ≥ 18.14 (requires native `fetch` with `Headers.getSetCookie()`).

See the [bilingual project page](https://pyronixus.github.io/pronoteTs) for a visual overview.
</div>

## Install

```bash
npm install pronoteTs
```

## Quick start

```ts
import { Client } from "pronoteTs";

const client = await Client.login(
  "https://TOWN.pronote.MYACADEMY.fr/pronote/eleve.html",
  "username",
  "password"
);

console.log(client.info.name);

const period = client.periods[0];
for (const grade of await period.grades()) {
  console.log(`${grade.subject.name}: ${grade.grade}/${grade.outOf}`);
}

for (const hw of await client.homework(new Date())) {
  console.log(hw.description);
}
```

## Logging in through an ENT

```ts
import { Client } from "pronoteTs";
import * as ent from "pronoteTs/ent";

const client = await Client.login(
  "https://TOWN.pronote.MYACADEMY.fr/pronote/eleve.html?login=true",
  "ent_username",
  "ent_password",
  { ent: ent.acRennes } // or ent.valDeMarne, ent.entHdf, ent.ileDeFrance, etc.
);
```

Every ENT provider from pronotepy is ported in `src/ent/ent.ts` (CAS, CAS+EduConnect, Open ENT NG, Open ENT NG+EduConnect, WAYF, HubEduConnect, Oze ENT, plain login forms, and the bespoke `ac_rennes`/Toutatice flow). The generic building blocks (`cas`, `casEdu`, `educonnect`, `openEntNg`, `wayf`, ...) are also exported so you can wire up an unlisted ENT yourself.

## QR code / token login

```ts
import { Client } from "pronoteTs";

const qrData = { login: "...", jeton: "...", url: "..." }; // scanned from the PRONOTE mobile app
const client = await Client.qrcodeLogin(qrData, "1234", crypto.randomUUID());

// Refresh later without re-scanning:
const creds = client.exportCredentials();
const client2 = await Client.tokenLogin(creds.pronoteUrl, creds.username, creds.password, creds.uuid);
```

## Parent / school-staff accounts

```ts
import { ParentClient, VieScolaireClient } from "pronoteTs";

const parent = await ParentClient.login(url, username, password);
console.log(parent.children.map((c) => c.name));
parent.setChild("Child Name");

const staff = await VieScolaireClient.login(url, username, password);
for (const klass of staff.classes) {
  console.log(klass.name, await klass.students());
}
```

## What's covered

- **Cryptography**: `Encryption` (RSA-1024 PKCS#1 v1.5 for the handshake, AES-128-CBC for the session), faithful to `pronoteAPI._Encryption`.
- **Communication**: raw zlib compression, request/response encryption, PRONOTE error handling, automatic keep-alive (`client.keepAlive()`).
- **Authentication**: password, ENT (cookie-based), QR code, persistent token, two-factor auth (PIN + device registration).
- **Data model** (`src/dataClasses.ts`): `Grade`, `Average`, `Period`, `Report`, `Absence`, `Delay`, `Punishment`, `Lesson`, `LessonContent`, `Homework`, `Attachment`, `Information`, `Discussion`, `Message`, `Recipient`, `ClientInfo`, `Student`, `Guardian`, `Identity`, `StudentClass`, `Menu`, `TeachingStaff`, `Acquisition`, `Evaluation`.
- **Clients**: `Client` (student), `ParentClient`, `VieScolaireClient`, all derived from `ClientBase`.
- **ENT**: 30+ preconfigured institutions/providers plus every reusable generic function.

Examples of supported ENT providers include Toutatice/ac-Rennes, Val-de-Marne, Île-de-France, ENT HDF, Kosmos, e-lyco, Auvergne-Rhône-Alpes, Mon Bureau Numérique, Occitanie, Lycée Connecté and Agora06. Custom providers can also be wired from the exported generic functions.

## Deliberate differences from pronotepy (Python)

- Fully asynchronous API (`Promise`/`async`/`await`) instead of blocking synchronous HTTP calls - `Client.login(...)` replaces `pronotepy.Client(...)`.
- Cookies handled via [`tough-cookie`](https://www.npmjs.com/package/tough-cookie) rather than `requests.Session`.
- End-to-end strict TypeScript typing (instead of Python duck-typing): autocompletion and compile-time checks across every data class.
- `client.keepAlive()` returns a `{ start(), stop() }` controller instead of a Python context manager.

## Build

```bash
npm run build     # compile src/ -> dist/
npm run example   # run assets/examples/example.ts with tsx
```

## Disclaimer

Unofficial project, not affiliated with Index Éducation. Use it in accordance with your school's terms of service.