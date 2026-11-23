# Cifrarium

Un numero al giorno da 0 a 1.000.000. Ogni numero viene analizzato e guadagna badge (primo, palindromo, scala, cifre ripetute, numeri famosi…) che valgono punti in base alla rarità. Sotto ogni badge sono evidenziate le cifre che lo hanno fatto scattare.

- **Oggi**: un tiro al giorno, numero colorato in base alla rarità, Top %, punti del giorno e di sempre, serie di giorni.
- **Allenamento**: tiri illimitati, tiro automatico che si ferma su una rarità o su un badge nuovo, statistiche, analisi di qualsiasi numero.
- **Classifica**: oggi, settimana, sempre, badge; per tutti o solo per gli amici. Mi piace sui tiri.
- **Feed**: gli ultimi tiri di tutti o degli amici.
- **Amici**: codice amico, ricerca per nome, richieste da accettare.
- **Impostazioni**: tema, colore del nome, due badge preferiti accanto al nome, uscita, eliminazione account.

## File

| File | Cosa contiene |
|---|---|
| `index.html`, `style.css` | Pagina e stile |
| `game.js` | Logica del gioco: badge, punti, rarità |
| `app.js` | Interfaccia |
| `social.js` | Accesso Google e database (Firebase) |
| `firestore.rules` | Regole di sicurezza del database |
| `firestore.indexes.json` | Indici del database |
| `.github/workflows/pages.yml` | Pubblicazione su GitHub Pages |

La configurazione Firebase **non è nel repository**: sta nel secret `FIREBASE_CONFIG` e la GitHub Action la scrive in `firebase-config.js` solo al momento della pubblicazione.

## Configurazione (una volta sola)

### 1. Secret su GitHub
Settings → Secrets and variables → Actions → New repository secret
- Nome: `FIREBASE_CONFIG`
- Valore: il JSON della configurazione dell'app web Firebase (quello con `projectId`, `apiKey`, `firestoreDatabaseId`…).

### 2. GitHub Pages
Settings → Pages → Source: **GitHub Actions**.

### 3. Firebase Authentication
Console Firebase → Authentication:
- Sign-in method → abilita **Google**.
- Settings → Authorized domains → aggiungi `bottaridennis.github.io`.

### 4. Regole e indici di Firestore
Console Firebase → Firestore → seleziona il database usato dal gioco:
- **Regole**: incolla il contenuto di `firestore.rules` e pubblica.
- **Indici**: crea i tre indici compositi di `firestore.indexes.json` sulla raccolta `rolls`:
  - `date` crescente, `total` decrescente
  - `uid` crescente, `date` crescente
  - `uid` crescente, `createdAt` decrescente

  In alternativa, quando un indice manca, la console del browser mostra un link che lo crea con un clic.

### 5. Proteggere la chiave API
In un sito web la configurazione Firebase arriva comunque al browser di chi gioca: è normale, ed è così per ogni sito che usa Firebase. A proteggere i dati sono le regole di Firestore. Per evitare che altri usino la tua chiave su altri siti:

Google Cloud Console → API e servizi → Credenziali → la chiave del browser → Restrizioni delle applicazioni → **Referrer HTTP** → aggiungi `https://bottaridennis.github.io/*` (e `https://spheric-splicer-wf4nj.firebaseapp.com/*` per l'accesso Google).

## Sviluppo in locale

Crea `firebase-config.js` (è ignorato da git):

```js
export const firebaseConfig = { /* il tuo JSON */ };
```

Poi avvia un server qualsiasi nella cartella, per esempio `python3 -m http.server`, e apri `http://localhost:8000`. Senza `firebase-config.js` il gioco funziona lo stesso, solo senza le parti online. Per l'accesso Google in locale aggiungi `localhost` ai domini autorizzati.

## Limiti da conoscere

Il numero viene tirato nel browser, quindi un giocatore esperto potrebbe falsificare il proprio tiro. Le regole impediscono di tirare due volte nello stesso giorno o di modificare un tiro già salvato. Per un controllo completo servirebbe una Cloud Function che tira il numero sul server.
