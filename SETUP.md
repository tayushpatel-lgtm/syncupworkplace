# Getting Syncup running on a Mac

Written for someone who has never used Terminal. Every step says what to type and
what you should see when it worked. Nothing here is dangerous — it all installs
into your own user account and can be undone.

Total time: about 20 minutes, most of it waiting.

---

## Before you start

**Open Terminal.** Press `Cmd` + `Space`, type `Terminal`, press `Enter`. A window
opens with a small block of text and a blinking cursor. That is where everything
below gets pasted.

**How to use the commands.** Copy a block, paste it into Terminal, press `Enter`.
Then **wait** until the blinking cursor comes back before pasting the next one.
Some steps take several minutes and look frozen — they are not.

**If it asks for your password**, type your Mac login password and press `Enter`.
Nothing appears on screen as you type — no dots, no stars. That is normal. Type it
and press `Enter` anyway.

---

## Step 1 — Install Homebrew

Homebrew is the tool that installs the other tools. This is the longest step,
around 10 minutes.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your password, then ask you to press `Enter` to continue. It may
also install "Command Line Tools" along the way — let it.

**When it finishes**, run this so your Mac knows where Homebrew put things:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

**Check it worked:**

```bash
brew --version
```

You should see something like `Homebrew 4.x.x`. If you see `command not found`,
close Terminal completely, open it again, and try `brew --version` once more.

---

## Step 2 — Install Node and Postgres

Node runs the app. Postgres is the database that stores everything.

```bash
brew install node postgresql@16
```

A few minutes of scrolling text. Ignore it all.

**Check it worked:**

```bash
node -v
```

You should see `v22.x.x` or higher. Anything starting with `v20` or above is fine.

---

## Step 3 — Start the database

```bash
brew services start postgresql@16
```

You should see `Successfully started postgresql@16`.

This now starts automatically every time you turn your Mac on. You never have to
think about it again.

---

## Step 4 — Download the app

```bash
cd ~/Documents
git clone https://github.com/tayushpatel-lgtm/syncupworkplace.git
cd syncupworkplace
git checkout claude/team-tool-build-ais51f
```

If GitHub asks you to sign in, use your GitHub username and a **personal access
token** as the password (GitHub no longer accepts account passwords here).

**Check it worked:**

```bash
ls
```

You should see a list including `app`, `components`, `lib`, `package.json`.

---

## Step 5 — Install the app's parts

```bash
npm install
```

Two or three minutes. It ends with something like `added 61 packages`.

---

## Step 6 — Set it up

```bash
npm run setup
```

It will stop and ask:

```
  DATABASE_URL:
```

**Just press `Enter`.** It fills in the local database you started in Step 3.

It then creates the database, builds the tables, and loads a demo company. It
finishes by printing sign-in details and:

```
Ready.
  Start it with:  npm run dev
```

---

## Step 7 — Run it

```bash
npm run dev
```

You should see:

```
▲ Next.js 16.3.1 (Turbopack)
- Local:   http://localhost:3000
✓ Ready in 2.3s
```

**Leave this window open.** The app only runs while this is on screen. Closing
Terminal, or pressing `Ctrl` + `C`, switches the site off.

---

## Step 8 — Open it

Go to your browser and visit:

**http://localhost:3000**

Sign in with:

- **Email:** `ayush@syncup.in`
- **Password:** `syncup1234`

Make the browser window reasonably wide. Under a certain width the app shows a
"open this on a wider screen" message on purpose — it is built for laptops and
tablets, not phones.

---

## Using it day to day

**To start it again later** (after restarting your Mac, for example) — open
Terminal and run:

```bash
cd ~/Documents/syncupworkplace
npm run dev
```

Then open http://localhost:3000 again. You only ever do Steps 1–6 once.

**To stop it** — click the Terminal window and press `Ctrl` + `C`.

**To wipe it and start over with fresh demo data:**

```bash
npm run db:reset
```

---

## When something goes wrong

**"This site can't be reached" in the browser**

The app is not running. Go back to the Terminal window from Step 7. If you got
your normal prompt back instead of the `✓ Ready` message, the app stopped —
run `npm run dev` again and read what it says.

**"command not found: brew"**

Close Terminal completely and open it again. If it still happens, re-run the two
`echo` / `eval` lines at the end of Step 1.

**"command not found: npm"**

Step 2 did not finish. Run `brew install node` again.

**The setup step says "The database did not answer"**

Postgres is not running. Run `brew services start postgresql@16`, then
`npm run setup` again.

**Terminal shows a wall of red text**

Copy the last 20 lines and send them over. The message near the top of the red
block is usually the real problem; everything below it is noise.

---

## The demo accounts

All three use the password `syncup1234`.

| Email | What you see |
|---|---|
| `ayush@syncup.in` | Everything — you are the CEO |
| `deepak@syncup.in` | An employee's view, no admin menu |
| `zoya@syncup.in` | The onboarding checklist a new hire meets |

The data is invented — thirteen people and a month of made-up history — so you can
click anything without breaking something real.
