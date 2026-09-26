import { Client, ParentClient } from "../src/index.js";
import * as ent from "../src/ent/index.js";

async function main() {
  // --- Student account, classic login ---
  const client = await Client.login(
    "https://demo.index-education.net/pronote/eleve.html",
    "demonstration",
    "pronotevs"
  );

  console.log("Logged in as:", client.info.name);

  const period = client.periods[0];
  const grades = await period.grades();
  for (const g of grades) {
    console.log(`${g.subject.name}: ${g.grade}/${g.outOf}`);
  }

  const homework = await client.homework(new Date());
  for (const h of homework) {
    console.log(`[${h.done ? "x" : " "}] ${h.subject.name}: ${h.description}`);
  }

  // --- Logging in through an ENT (example: académie de Rennes / Toutatice) ---
  // const client2 = await Client.login(
  //   "https://TOWN.pronote.MYACADEMY.fr/pronote/eleve.html?login=true",
  //   "my_username",
  //   "my_password",
  //   { ent: ent.acRennes }
  // );

  // --- Parent account with multiple children ---
  // const parent = await ParentClient.login(url, username, password);
  // parent.setChild("Child Name");
}

main().catch(console.error);
