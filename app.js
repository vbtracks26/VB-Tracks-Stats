
let players = JSON.parse(
    localStorage.getItem("volleyballPlayers") || "[]"
);

// FIREBASE CLOUD ROSTER
let cloudReady = false;
let cloudUserId = null;
let cloudRosterRef = null;
let cloudApi = null;
let unsubscribeRoster = null;
let saveQueue = Promise.resolve();
let pendingSaves = 0;
let cloudGeneration = 0;

function setCloudStatus(message, isError = false) {
    window.vbTracksCloudStatus = message;

    const status = document.getElementById("cloudStatus");

    if (status) {
        status.textContent = message;
        status.style.color = isError ? "#a00000" : "#333";
    }
}

function localRosterCopy() {
    return JSON.parse(
        localStorage.getItem("volleyballPlayers") || "[]"
    );
}

function saveLocalRoster() {
    localStorage.setItem(
        "volleyballPlayers",
        JSON.stringify(players)
    );
}

function requireCloud() {
    if (cloudReady && cloudUserId && cloudRosterRef) {
        return true;
    }

    alert(
        "Your cloud roster is still loading or unavailable. " +
        "No changes were made. Please try again when " +
        "the status says Cloud connected."
    );

    return false;
}

// SAVE PLAYERS TO FIREBASE
function savePlayers() {
    saveLocalRoster();

    const uid = cloudUserId;
    const ref = cloudRosterRef;
    const generation = cloudGeneration;
    const snapshot = players.map(player => ({ ...player }));

    pendingSaves++;
    setCloudStatus("Saving to cloud…");

    saveQueue = saveQueue
        .catch(() => {})
        .then(async () => {
            if (
                generation !== cloudGeneration ||
                uid !== cloudUserId ||
                !ref
            ) {
                return;
            }

            await cloudApi.setDoc(ref, {
                players: snapshot,
                updatedAt: cloudApi.serverTimestamp()
            });
        })
        .then(() => {
            if (generation === cloudGeneration) {
                pendingSaves--;

                if (pendingSaves === 0) {
                    setCloudStatus("☁️ Cloud connected — saved");
                }
            }
        })
        .catch(error => {
            if (generation === cloudGeneration) {
                pendingSaves--;
                cloudReady = false;

                setCloudStatus(
                    "⚠️ Cloud save failed. Your local backup " +
                    "remains on this device.",
                    true
                );

                console.error("Roster save failed:", error);

                alert(
                    "Cloud save failed. Your changes remain " +
                    "in this browser, but are NOT synced. " +
                    "Do not edit the roster on another device."
                );
            }
        });
}

// INITIALIZE CLOUD ROSTER
async function initializeCloudRoster(user, db, firestore) {
    const generation = ++cloudGeneration;

    if (unsubscribeRoster) {
        unsubscribeRoster();
        unsubscribeRoster = null;
    }

    cloudReady = false;
    cloudUserId = user.uid;
    cloudApi = firestore;

    cloudRosterRef = firestore.doc(
        db,
        "users",
        user.uid,
        "rosters",
        "main"
    );

    setCloudStatus("Connecting to cloud…");

    try {
        const local = localRosterCopy();

        // Only create the cloud roster if one does not exist.
        const initial = await firestore.runTransaction(
            db,
            async transaction => {
                const existing = await transaction.get(
                    cloudRosterRef
                );

                if (existing.exists()) {
                    return existing.data();
                }

                transaction.set(cloudRosterRef, {
                    players: local,
                    createdAt: firestore.serverTimestamp(),
                    updatedAt: firestore.serverTimestamp()
                });

                return { players: local };
            }
        );

        if (generation !== cloudGeneration) {
            return;
        }

        players = Array.isArray(initial.players)
            ? initial.players
            : [];

        saveLocalRoster();

        cloudReady = true;
        setCloudStatus("☁️ Cloud connected");

        if (document.getElementById("rosterList")) {
            displayRoster();
        }

        // Listen for changes from another device.
        unsubscribeRoster = firestore.onSnapshot(
            cloudRosterRef,
            snapshot => {
                if (
                    generation !== cloudGeneration ||
                    !snapshot.exists() ||
                    pendingSaves > 0
                ) {
                    return;
                }

                const remote = snapshot.data().players;

                if (!Array.isArray(remote)) {
                    return;
                }

                players = remote;
                saveLocalRoster();

                setCloudStatus("☁️ Cloud connected");

                if (document.getElementById("rosterList")) {
                    displayRoster();
                }
            },
            error => {
                if (generation !== cloudGeneration) {
                    return;
                }

                cloudReady = false;

                setCloudStatus(
                    "⚠️ Cloud connection lost. Reload to retry.",
                    true
                );

                console.error("Roster listener failed:", error);
            }
        );
    } catch (error) {
        if (generation !== cloudGeneration) {
            return;
        }

        cloudReady = false;

        setCloudStatus(
            "⚠️ Cloud connection failed. " +
            "Check Firebase permissions and reload.",
            true
        );

        console.error("Cloud initialization failed:", error);
    }
}

// CONNECT FIREBASE
(async function connectCloud() {
    try {
        const [
            { auth, db },
            firestore,
            authApi
        ] = await Promise.all([
            import("./firebase-config.js"),
            import(
                "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js"
            ),
            import(
                "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js"
            )
        ]);

        authApi.onAuthStateChanged(auth, user => {
            if (user) {
                initializeCloudRoster(user, db, firestore);
            } else {
                ++cloudGeneration;

                if (unsubscribeRoster) {
                    unsubscribeRoster();
                    unsubscribeRoster = null;
                }

                cloudReady = false;
                cloudUserId = null;
                cloudRosterRef = null;

                // Preserve the browser backup during sign-in.
                // It may contain the roster we need to migrate.
                players = localRosterCopy();

                setCloudStatus(
                    "Sign in to load your roster"
                );
            }
        });
    } catch (error) {
        setCloudStatus(
            "⚠️ Firebase could not load. Reload to retry.",
            true
        );

        console.error("Firebase import failed:", error);
    }
})();

// TEAM MANAGER
function openTeamManager() {
    document.querySelector("main").innerHTML = `
        <h2>Team Manager</h2>

        <p
            id="cloudStatus"
            role="status"
            style="text-align:center;font-size:13px;"
        >
            ${window.vbTracksCloudStatus || "Connecting to cloud…"}
        </p>

        <input
            id="playerName"
            placeholder="Player Name"
        >

        <input
            id="playerNumber"
            type="number"
            placeholder="Jersey Number"
        >

        <select id="playerPosition">
            <option value="">Select Position</option>
            <option>Setter</option>
            <option>Outside Hitter</option>
            <option>Middle Hitter</option>
            <option>Opposite Hitter</option>
            <option>Defensive Specialist</option>
            <option>Libero</option>
        </select>

        <button onclick="addPlayer()">
            Add Player
        </button>

        <h3>Team Roster</h3>
        <div id="rosterList"></div>

        <div style="
            display: flex;
            gap: 10px;
            margin-top: 15px;
        ">
            <button
                onclick="backupRoster()"
                style="
                    flex: 1;
                    min-width: 0;
                    margin: 0;
                    padding: 12px 6px;
                    font-size: 14px;
                "
            >
                💾 Backup Roster
            </button>

            <button
                onclick="downloadRosterPDF()"
                style="
                    flex: 1;
                    min-width: 0;
                    margin: 0;
                    padding: 12px 6px;
                    font-size: 14px;
                "
            >
                📄 Download PDF
            </button>
        </div>

        <button onclick="goHome()">
            Back to Home
        </button>
    `;

    displayRoster();
}

// ADD PLAYER
function addPlayer() {
    if (!requireCloud()) return;

    const name = document
        .getElementById("playerName")
        .value.trim();

    const number = document
        .getElementById("playerNumber")
        .value.trim();

    const position = document
        .getElementById("playerPosition")
        .value;

    if (!name || !number || !position) {
        alert("Please complete all player information.");
        return;
    }

    if (!/^\d+$/.test(number)) {
        alert("Please enter a valid jersey number.");
        return;
    }

    if (players.some(player => player.number === number)) {
        alert("That jersey number is already assigned.");
        return;
    }

    players.push({
        id: Date.now().toString() + Math.random(),
        name,
        number,
        position
    });

    savePlayers();
    openTeamManager();
}

// DISPLAY ROSTER
function displayRoster() {
    const rosterList = document.getElementById("rosterList");

    if (!rosterList) return;

    rosterList.innerHTML = "";

    players
        .slice()
        .sort(
            (a, b) =>
                Number(a.number) - Number(b.number)
        )
        .forEach(player => {
            const item = document.createElement("div");

            item.style.padding = "12px";
            item.style.marginBottom = "10px";
            item.style.background = "white";
            item.style.border = "2px solid #c5a253";
            item.style.borderRadius = "10px";

            const details = document.createElement("p");

            details.textContent =
                `#${player.number} - ${player.name} (${player.position})`;

            const editButton = document.createElement("button");
            editButton.textContent = "Edit";
            editButton.onclick = () => editPlayer(player.id);

            const removeButton = document.createElement("button");
            removeButton.textContent = "Remove";
            removeButton.onclick = () => removePlayer(player.id);

            const buttonRow = document.createElement("div");

            buttonRow.style.display = "flex";
            buttonRow.style.gap = "8px";

            [editButton, removeButton].forEach(button => {
                button.style.width = "auto";
                button.style.padding = "8px 16px";
                button.style.fontSize = "14px";
                button.style.margin = "0";
                button.style.flex = "1";
            });

            buttonRow.append(
                editButton,
                removeButton
            );

            item.append(
                details,
                buttonRow
            );

            rosterList.appendChild(item);
        });
}

// REMOVE PLAYER
function removePlayer(id) {
    if (!requireCloud()) return;

    if (!confirm("Remove this player from the roster?")) {
        return;
    }

    players = players.filter(
        player => player.id !== id
    );

    savePlayers();
    openTeamManager();
}

// EDIT PLAYER
function editPlayer(id) {
    if (!requireCloud()) return;

    const player = players.find(
        p => p.id === id
    );

    if (!player) return;

    window.editingPlayerId = id;

    document.querySelector("main").innerHTML = `
        <h2>Edit Player</h2>

        <label for="editName">
            Player Name
        </label>

        <input
            id="editName"
            placeholder="Player Name"
        >

        <label for="editNumber">
            Jersey Number
        </label>

        <input
            id="editNumber"
            type="number"
            placeholder="Jersey Number"
        >

        <label for="editPosition">
            Position
        </label>

        <select id="editPosition">
            <option>Setter</option>
            <option>Outside Hitter</option>
            <option>Middle Hitter</option>
            <option>Opposite Hitter</option>
            <option>Defensive Specialist</option>
            <option>Libero</option>
        </select>

        <button onclick="savePlayerEdit()">
            Save Changes
        </button>

        <button onclick="openTeamManager()">
            Cancel
        </button>
    `;

    document.getElementById("editName").value =
        player.name;

    document.getElementById("editNumber").value =
        player.number;

    document.getElementById("editPosition").value =
        player.position;
}

// SAVE PLAYER EDITS
function savePlayerEdit() {
    if (!requireCloud()) return;

    const player = players.find(
        p => p.id === window.editingPlayerId
    );

    if (!player) return;

    const name = document
        .getElementById("editName")
        .value.trim();

    const number = document
        .getElementById("editNumber")
        .value.trim();

    const position = document
        .getElementById("editPosition")
        .value;

    if (!name || !number || !position) {
        alert("Please complete all player information.");
        return;
    }

    if (!/^\d+$/.test(number)) {
        alert("Please enter a valid jersey number.");
        return;
    }

    if (
        players.some(
            p =>
                p.id !== player.id &&
                p.number === number
        )
    ) {
        alert("That jersey number is already assigned.");
        return;
    }

    player.name = name;
    player.number = number;
    player.position = position;

    savePlayers();
    openTeamManager();
}

// RETURN HOME
function goHome() {
    document.querySelector("main").innerHTML = `
        <button>New Match</button>
        <button>Load Match</button>
        <button onclick="openTeamManager()">
            Team Manager
        </button>
        <button>Season Stats</button>
        <button>Settings</button>
    `;
}

// BACKUP ROSTER
function backupRoster() {
    if (!cloudReady) {
        alert(
            "Please wait for your cloud roster " +
            "to connect before backing up."
        );
        return;
    }

    if (players.length === 0) {
        alert("No roster found to back up.");
        return;
    }

    const roster = JSON.stringify(players);

    const blob = new Blob([roster], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "VB-Tracks-Roster-Backup.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(
        () => URL.revokeObjectURL(url),
        1000
    );
}

// ESCAPE TEXT FOR SAFE HTML OUTPUT
function escapeRosterText(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

// PRINTABLE PDF ROSTER
function downloadRosterPDF() {
    if (!requireCloud()) return;

    if (players.length === 0) {
        alert("Add players before downloading a roster.");
        return;
    }

    const sortedPlayers = players
        .slice()
        .sort(
            (a, b) =>
                Number(a.number) - Number(b.number)
        );

    const rows = sortedPlayers.map(player => `
        <tr>
            <td>${escapeRosterText(player.number)}</td>
            <td>${escapeRosterText(player.name)}</td>
            <td>${escapeRosterText(player.position)}</td>
        </tr>
    `).join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        alert("Please allow pop-ups to print your roster.");
        return;
    }

    printWindow.document.open();

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Castle Heights Volleyball Roster</title>

            <style>
                @page {
                    size: letter;
                    margin: 0.65in;
                }

                body {
                    font-family: Arial, sans-serif;
                    color: #111;
                    margin: 0;
                }

                h1 {
                    text-align: center;
                    margin-bottom: 5px;
                    font-size: 24px;
                }

                h2 {
                    text-align: center;
                    margin-top: 0;
                    font-size: 16px;
                    font-weight: normal;
                }

                .gold-line {
                    height: 5px;
                    background: #c5a253;
                    margin: 20px 0;
                    print-color-adjust: exact;
                    -webkit-print-color-adjust: exact;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }

                th {
                    background: #111;
                    color: white;
                    text-align: left;
                    padding: 12px;
                    print-color-adjust: exact;
                    -webkit-print-color-adjust: exact;
                }

                td {
                    border-bottom: 1px solid #ddd;
                    padding: 11px 12px;
                }

                th:first-child,
                td:first-child {
                    width: 70px;
                    text-align: center;
                }

                tr {
                    break-inside: avoid;
                }

                thead {
                    display: table-header-group;
                }

                .footer {
                    margin-top: 25px;
                    font-size: 11px;
                    color: #666;
                    text-align: center;
                }

                .print-button {
                    display: block;
                    margin: 20px auto;
                    padding: 12px 24px;
                    background: #c5a253;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: bold;
                    cursor: pointer;
                }

                @media print {
                    .print-button {
                        display: none;
                    }
                }
            </style>
        </head>

        <body>
            <h1>CASTLE HEIGHTS VOLLEYBALL</h1>
            <h2>Lady Knights | Team Roster</h2>

            <div class="gold-line"></div>

            <table>
                <thead>
                    <tr>
                        <th>Jersey #</th>
                        <th>Player Name</th>
                        <th>Position</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows}
                </tbody>
            </table>

            <div class="footer">
                Total Players: ${sortedPlayers.length}
            </div>

            <button
                class="print-button"
                onclick="window.print()"
            >
                Print / Save as PDF
            </button>
        </body>
        </html>
    `);

    printWindow.document.close();
}
