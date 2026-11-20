
let players = JSON.parse(
    localStorage.getItem("volleyballPlayers") || "[]"
);

let cloudReady = false;
let cloudUserId = null;
let cloudRosterRef = null;
let cloudApi = null;
let unsubscribeRoster = null;
let saveQueue = Promise.resolve();
let pendingSaves = 0;
let cloudGeneration = 0;

const positions = [
    "Setter",
    "Outside Hitter",
    "Middle Hitter",
    "Opposite Hitter",
    "Defensive Specialist",
    "Libero"
];

function gradeLabel(grade) {
    if (String(grade) === "7") return "7th Grade";
    if (String(grade) === "8") return "8th Grade";
    return "Not Set";
}

function positionOptions(selected = "") {
    return positions.map(position => `
        <option value="${position}"
            ${position === selected ? "selected" : ""}>
            ${position}
        </option>
    `).join("");
}

function gradeOptions(selected = "") {
    return `
        <option value="" ${!selected ? "selected" : ""}>
            Select Grade
        </option>
        <option value="7"
            ${String(selected) === "7" ? "selected" : ""}>
            7th Grade
        </option>
        <option value="8"
            ${String(selected) === "8" ? "selected" : ""}>
            8th Grade
        </option>
    `;
}

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

function setCloudStatus(message, isError = false) {
    window.vbTracksCloudStatus = message;
    window.vbTracksCloudError = isError;

    const status = document.getElementById("cloudStatus");

    if (status) {
        status.textContent = message;
        status.style.color = isError ? "#a00000" : "#333";
    }
}

function localRosterCopy() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("volleyballPlayers") || "[]"
        );
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error("Local roster error:", error);
        return [];
    }
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
        "No changes were made. Please wait for Cloud connected."
    );
    return false;
}

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
                    "⚠️ Cloud save failed. Local backup preserved.",
                    true
                );

                console.error("Roster save failed:", error);

                alert(
                    "Cloud save failed. Your changes are saved " +
                    "in this browser but have NOT synced. " +
                    "Do not edit on another device."
                );
            }
        });
}

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

        if (generation !== cloudGeneration) return;

        players = Array.isArray(initial.players)
            ? initial.players
            : [];

        saveLocalRoster();
        cloudReady = true;
        setCloudStatus("☁️ Cloud connected");

        refreshCurrentPage();

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

                if (!Array.isArray(remote)) return;

                players = remote;
                saveLocalRoster();
                setCloudStatus("☁️ Cloud connected");
                refreshCurrentPage();
            },
            error => {
                if (generation !== cloudGeneration) return;

                cloudReady = false;
                setCloudStatus(
                    "⚠️ Cloud connection lost. Reload to retry.",
                    true
                );

                console.error("Roster listener failed:", error);
            }
        );
    } catch (error) {
        if (generation !== cloudGeneration) return;

        cloudReady = false;
        setCloudStatus(
            "⚠️ Cloud connection failed. Reload to retry.",
            true
        );
        console.error("Cloud initialization failed:", error);
    }
}

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
                players = localRosterCopy();

                setCloudStatus("Sign in to load your roster");
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

function refreshCurrentPage() {
    if (document.getElementById("rosterList")) {
        displayRoster();
    }

    if (document.getElementById("playerCards")) {
        displayPlayerCards();
    }

    if (document.getElementById("playerProfile")) {
        const id = window.currentProfileId;
        if (id) showPlayerProfile(id);
    }
}

// HOME DASHBOARD
function goHome() {
    document.querySelector("main").innerHTML = `
       <button onclick="openMatchSetup()">New Match</button>
        <button>Load Match</button>
        <button onclick="openRoster()">
            Roster
        </button>
        <button onclick="openTeamManager()">
            Team Manager
        </button>
        <button>Season Stats</button>
        <button>Settings</button>
    `;
}



function openMatchSetup() {
    document.querySelector("main").innerHTML = `
        <h2>🏐 New Match</h2>
        <p>Castle Heights Lady Knights</p>

        <label for="matchOpponent">Opponent</label>
        <input
            id="matchOpponent"
            type="text"
            placeholder="Enter opponent name"
        >

        <label for="matchDate">Match Date</label>
        <input id="matchDate" type="date">

        <label for="matchLocation">Location</label>
        <select id="matchLocation">
            <option value="Home">Home</option>
            <option value="Away">Away</option>
            <option value="Neutral">Neutral / Tournament</option>
        </select>

        <label for="matchSets">Number of Sets</label>
        <select id="matchSets">
            <option value="3">3 Sets (Default)</option>
            <option value="4">4 Sets</option>
            <option value="5">5 Sets</option>
                </select>

        <h3>Starting Lineup</h3>
        <p>Select your six starting players and their court positions.</p>

        
<div id="startingLineup" class="lineup-court">

  <div class="lineup-net">NET</div>

  <div class="lineup-positions">

    <div class="lineup-position">
      <label for="starter4">Position 4 — Left Front</label>
      <select id="starter4" class="starter-select"></select>
    </div>

    <div class="lineup-position">
      <label for="starter3">Position 3 — Middle Front</label>
      <select id="starter3" class="starter-select"></select>
    </div>

    <div class="lineup-position">
      <label for="starter2">Position 2 — Right Front</label>
      <select id="starter2" class="starter-select"></select>
    </div>

    <div class="lineup-position">
      <label for="starter5">Position 5 — Left Back</label>
      <select id="starter5" class="starter-select"></select>
    </div>

    <div class="lineup-position">
      <label for="starter6">Position 6 — Middle Back</label>
      <select id="starter6" class="starter-select"></select>
    </div>

    <div class="lineup-position">
      <label for="starter1">Position 1 — Right Back</label>
      <select id="starter1" class="starter-select"></select>
    </div>

  </div>
</div>

        <button onclick="previewMatchSetup()">
            Preview Match
        </button>

        <p id="matchPreviewMessage"></p>

        <button onclick="goHome()">
            Back to Home
        </button>
    `;

    const today = new Date();
    const localDate = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

    document.getElementById("matchDate").value = localDate;
populateStartingLineup();
}


function populateStartingLineup() {
    const positions = [4, 3, 2, 5, 6, 1];

    positions.forEach(position => {
        const dropdown = document.getElementById("starter" + position);

        if (!dropdown) return;

        dropdown.innerHTML = `<option value="">Select Player</option>`;

        players.forEach((player, index) => {
            const option = document.createElement("option");

            option.value = String(index);
            option.textContent =
                `#${player.number ?? "—"} ${player.name || "Unnamed Player"}`;

            dropdown.appendChild(option);
        });

        dropdown.addEventListener("change", updateStartingLineupOptions);
    });

    updateStartingLineupOptions();
}

function updateStartingLineupOptions() {
    const positions = [4, 3, 2, 5, 6, 1];

    const selectedPlayers = positions
        .map(position =>
            document.getElementById("starter" + position)?.value
        )
        .filter(value => value !== "" && value !== undefined);

    positions.forEach(position => {
        const dropdown = document.getElementById("starter" + position);

        if (!dropdown) return;

        Array.from(dropdown.options).forEach(option => {
            if (option.value === "") return;

            option.hidden =
                option.value !== dropdown.value &&
                selectedPlayers.includes(option.value);

            option.disabled =
                option.value !== dropdown.value &&
                selectedPlayers.includes(option.value);
        });
    });
}


function previewMatchSetup() {
    const opponent = document.getElementById("matchOpponent")
        .value.trim();

    const date = document.getElementById("matchDate").value;
    const location = document.getElementById("matchLocation").value;
    const sets = document.getElementById("matchSets").value;

    if (!opponent || !date) {
        alert("Please enter an opponent and match date.");
        return;
    }

    document.getElementById("matchPreviewMessage").textContent =
        "Match ready: " + opponent +
        " | " + date +
        " | " + location +
        " | " + sets + " sets. " +
        
"This is a preview only. Nothing has been saved.";

    const previewArea =
        document.getElementById("matchPreviewMessage");

    const startButton = document.createElement("button");
    startButton.textContent = "🏐 Start Match";
    startButton.onclick = openLiveCourt;

    previewArea.insertAdjacentElement("afterend", startButton);
}


// TEAM MANAGER
function openTeamManager() {
    document.querySelector("main").innerHTML = `
        <h2>Team Manager</h2>

        <p id="cloudStatus" role="status"
           style="text-align:center;font-size:13px;">
            ${escapeRosterText(
                window.vbTracksCloudStatus ||
                "Connecting to cloud…"
            )}
        </p>

        <input id="playerName" placeholder="Player Name">

        <input
            id="playerNumber"
            type="number"
            placeholder="Jersey Number"
        >

        <select id="playerGrade">
            ${gradeOptions()}
        </select>

        <select id="playerPosition">
            <option value="">Select Position</option>
            ${positionOptions()}
        </select>

        <button onclick="addPlayer()">Add Player</button>

        <h3>Team Roster</h3>
        <div id="rosterList"></div>

        <div style="display:flex;gap:10px;margin-top:15px;">
            <button onclick="backupRoster()"
                style="flex:1;min-width:0;margin:0;
                padding:12px 6px;font-size:14px;">
                💾 Backup Roster
            </button>

            <button onclick="downloadRosterPDF()"
                style="flex:1;min-width:0;margin:0;
                padding:12px 6px;font-size:14px;">
                📄 Download PDF
            </button>
        </div>

        <button onclick="goHome()">Back to Home</button>
    `;

    displayRoster();
}

function addPlayer() {
    if (!requireCloud()) return;

    const name = document.getElementById("playerName")
        .value.trim();

    const number = document.getElementById("playerNumber")
        .value.trim();

    const grade = document.getElementById("playerGrade")
        .value;

    const position = document.getElementById("playerPosition")
        .value;

    if (!name || !number || !grade || !position) {
        alert("Please complete all player information.");
        return;
    }

    if (!/^\d+$/.test(number)) {
        alert("Please enter a valid jersey number.");
        return;
    }

    if (players.some(player =>
        String(player.number) === number
    )) {
        alert("That jersey number is already assigned.");
        return;
    }

    players.push({
        id: Date.now().toString() + Math.random(),
        name,
        number,
        grade,
        position
    });

    savePlayers();
    openTeamManager();
}

function displayRoster() {
    const rosterList = document.getElementById("rosterList");
    if (!rosterList) return;

    rosterList.innerHTML = "";

    players.slice()
        .sort((a, b) => Number(a.number) - Number(b.number))
        .forEach(player => {
            const item = document.createElement("div");

            item.style.cssText = `
                padding:12px;
                margin-bottom:10px;
                background:white;
                border:2px solid #c5a253;
                border-radius:10px;
            `;

            const details = document.createElement("p");
            details.textContent =
                "#" + player.number + " - " +
                player.name + " (" + player.position +
                ") • " + gradeLabel(player.grade);

            const editButton = document.createElement("button");
            editButton.textContent = "Edit";
            editButton.onclick = () => editPlayer(player.id);

            const removeButton = document.createElement("button");
            removeButton.textContent = "Remove";
            removeButton.onclick = () => removePlayer(player.id);

            const buttonRow = document.createElement("div");
            buttonRow.style.cssText = "display:flex;gap:8px;";

            [editButton, removeButton].forEach(button => {
                button.style.cssText = `
                    flex:1;width:auto;margin:0;
                    padding:8px 16px;font-size:14px;
                `;
            });

            buttonRow.append(editButton, removeButton);
            item.append(details, buttonRow);
            rosterList.appendChild(item);
        });
}

function removePlayer(id) {
    if (!requireCloud()) return;

    if (!confirm("Remove this player from the roster?")) return;

    players = players.filter(player => player.id !== id);
    savePlayers();
    openTeamManager();
}

function editPlayer(id) {
    if (!requireCloud()) return;

    const player = players.find(p => p.id === id);
    if (!player) return;

    window.editingPlayerId = id;

    document.querySelector("main").innerHTML = `
        <h2>Edit Player</h2>

        <label for="editName">Player Name</label>
        <input id="editName" placeholder="Player Name">

        <label for="editNumber">Jersey Number</label>
        <input id="editNumber" type="number">

        <label for="editGrade">Grade</label>
        <select id="editGrade">
            ${gradeOptions(player.grade)}
        </select>

        <label for="editPosition">Position</label>
        <select id="editPosition">
            ${positionOptions(player.position)}
        </select>

        <button onclick="savePlayerEdit()">Save Changes</button>
        <button onclick="openTeamManager()">Cancel</button>
    `;

    document.getElementById("editName").value = player.name;
    document.getElementById("editNumber").value = player.number;
}

function savePlayerEdit() {
    if (!requireCloud()) return;

    const player = players.find(
        p => p.id === window.editingPlayerId
    );

    if (!player) return;

    const name = document.getElementById("editName")
        .value.trim();

    const number = document.getElementById("editNumber")
        .value.trim();

    const grade = document.getElementById("editGrade")
        .value;

    const position = document.getElementById("editPosition")
        .value;

    if (!name || !number || !grade || !position) {
        alert("Please complete all player information.");
        return;
    }

    if (!/^\d+$/.test(number)) {
        alert("Please enter a valid jersey number.");
        return;
    }

    if (players.some(p =>
        p.id !== player.id &&
        String(p.number) === number
    )) {
        alert("That jersey number is already assigned.");
        return;
    }

    player.name = name;
    player.number = number;
    player.grade = grade;
    player.position = position;

    savePlayers();
    openTeamManager();
}

// VIEW-ONLY ROSTER
function openRoster() {
    document.querySelector("main").innerHTML = `
        <h2>Roster</h2>
        <p style="text-align:center;color:#666;">
            Castle Heights Lady Knights
        </p>

        <div id="playerCards"></div>

        <button onclick="goHome()">Back to Home</button>
    `;

    displayPlayerCards();
}

function displayPlayerCards() {
    const container = document.getElementById("playerCards");
    if (!container) return;

    container.innerHTML = "";

    if (players.length === 0) {
        container.textContent = "No players on the roster yet.";
        return;
    }

    players.slice()
        .sort((a, b) => Number(a.number) - Number(b.number))
        .forEach(player => {
            const card = document.createElement("button");

            card.style.cssText = `
                display:flex;
                align-items:center;
                gap:14px;
                width:100%;
                margin:0 0 12px;
                padding:15px;
                text-align:left;
                background:white;
                color:#111;
                border:2px solid #c5a253;
                border-radius:12px;
                cursor:pointer;
            `;

            const avatar = document.createElement("span");
            avatar.textContent = "#" + player.number;
            avatar.style.cssText = `
                display:flex;
                align-items:center;
                justify-content:center;
                flex-shrink:0;
                width:60px;
                height:60px;
                border-radius:50%;
                background:#111;
                color:#c5a253;
                font-size:18px;
                font-weight:bold;
            `;

            const info = document.createElement("span");
            info.style.cssText = "display:block;flex:1;";

            const name = document.createElement("strong");
            name.textContent = player.name;
            name.style.cssText = `
                display:block;
                font-size:17px;
                margin-bottom:5px;
            `;

            const details = document.createElement("span");
            details.textContent =
                gradeLabel(player.grade) +
                " • " + player.position;
            details.style.cssText = `
                display:block;
                font-size:13px;
                color:#555;
            `;

            info.append(name, details);
            card.append(avatar, info);

            card.onclick = () => showPlayerProfile(player.id);

            container.appendChild(card);
        });
}


// PLAYER PROFILE
function showPlayerProfile(id) {
    const player = players.find(p => p.id === id);

    if (!player) {
        openRoster();
        return;
    }

    window.currentProfileId = id;

    const safeName = escapeRosterText(player.name);
    const safeNumber = escapeRosterText(player.number);
    const safePosition = escapeRosterText(player.position);
    const safeGrade = escapeRosterText(gradeLabel(player.grade));

    const main = document.querySelector("main");

    main.innerHTML = `
        <div id="playerProfile">

            <button onclick="openRoster()">
                ← Back to Team Roster
            </button>

            <div style="
                background:#171717;
                color:white;
                padding:24px 18px;
                border-radius:18px;
                margin:16px 0;
                border-bottom:5px solid #c5a253;
            ">

                <div style="
                    display:flex;
                    align-items:center;
                    gap:18px;
                ">

                    <div style="
                        width:95px;
                        height:95px;
                        min-width:95px;
                        border-radius:50%;
                        background:#c5a253;
                        color:#111;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-size:34px;
                        font-weight:900;
                        border:4px solid white;
                        box-sizing:border-box;
                    ">
                        ${safeNumber}
                    </div>

                    <div style="min-width:0;">
                        <h2 style="
                            color:white;
                            margin:0 0 8px;
                            font-size:23px;
                            overflow-wrap:anywhere;
                        ">
                            ${safeName}
                        </h2>

                        <p style="
                            color:#c5a253;
                            margin:0 0 6px;
                            font-weight:bold;
                        ">
                            #${safeNumber} • ${safePosition}
                        </p>

                        <p style="
                            color:#ddd;
                            margin:0;
                            font-size:14px;
                        ">
                            ${safeGrade}
                        </p>
                    </div>
                </div>
            </div>

            <h3>🏐 Player Information</h3>

            <div style="
                background:white;
                padding:18px;
                border:1px solid #ddd;
                border-radius:12px;
                margin-bottom:20px;
            ">
                <p><strong>Name:</strong> ${safeName}</p>
                <p><strong>Jersey:</strong> #${safeNumber}</p>
                <p><strong>Grade:</strong> ${safeGrade}</p>
                <p><strong>Position:</strong> ${safePosition}</p>
            </div>

            <h3>📊 Season Statistics</h3>

            <div style="
                display:grid;
                grid-template-columns:repeat(3,minmax(0,1fr));
                gap:10px;
                margin-bottom:14px;
            ">
                ${[
                    "Kills",
                    "Aces",
                    "Digs",
                    "Assists",
                    "Blocks",
                    "Serve %"
                ].map(stat => `
                    <div style="
                        background:#171717;
                        border:2px solid #c5a253;
                        border-radius:12px;
                        padding:14px 5px;
                        text-align:center;
                    ">
                        <div style="
                            color:#c5a253;
                            font-size:25px;
                            font-weight:bold;
                        ">—</div>

                        <div style="
                            color:white;
                            font-size:12px;
                            margin-top:5px;
                        ">
                            ${stat}
                        </div>
                    </div>
                `).join("")}
            </div>

            <p style="
                color:#666;
                text-align:center;
                font-size:13px;
                margin-bottom:24px;
            ">
                Statistics will appear when match tracking
                is connected.
            </p>

            <h3>📅 Match History</h3>

            <div style="
                background:white;
                border:2px solid #c5a253;
                border-radius:12px;
                padding:22px;
                text-align:center;
                color:#666;
            ">
                <p style="font-weight:bold;color:#111;">
                    No Matches Recorded Yet
                </p>
                <p style="font-size:14px;">
                    This player's match history and
                    individual performance will appear here.
                </p>
            </div>

            <button
                onclick="openRoster()"
                style="margin-top:20px;"
            >
                Back to Team Roster
            </button>

        </div>
    `;
}



// BACKUP ROSTER
function backupRoster() {
    if (!cloudReady) {
        alert("Wait for your cloud roster to connect.");
        return;
    }

    if (players.length === 0) {
        alert("No roster found to back up.");
        return;
    }

    const blob = new Blob(
        [JSON.stringify(players, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "VB-Tracks-Roster-Backup.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// PRINTABLE ROSTER
function downloadRosterPDF() {
    if (!requireCloud()) return;

    if (players.length === 0) {
        alert("Add players before downloading a roster.");
        return;
    }

    const sortedPlayers = players.slice().sort(
        (a, b) => Number(a.number) - Number(b.number)
    );

    const rows = sortedPlayers.map(player => `
        <tr>
            <td>${escapeRosterText(player.number)}</td>
            <td>${escapeRosterText(player.name)}</td>
            <td>${escapeRosterText(gradeLabel(player.grade))}</td>
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
                    size:letter;
                    margin:0.65in;
                }

                body {
                    font-family:Arial,sans-serif;
                    color:#111;
                    margin:0;
                }

                h1 {
                    text-align:center;
                    margin-bottom:5px;
                    font-size:24px;
                }

                h2 {
                    text-align:center;
                    margin-top:0;
                    font-size:16px;
                    font-weight:normal;
                }

                .gold-line {
                    height:5px;
                    background:#c5a253;
                    margin:20px 0;
                    print-color-adjust:exact;
                    -webkit-print-color-adjust:exact;
                }

                table {
                    width:100%;
                    border-collapse:collapse;
                    font-size:13px;
                }

                th {
                    background:#111;
                    color:white;
                    text-align:left;
                    padding:12px;
                    print-color-adjust:exact;
                    -webkit-print-color-adjust:exact;
                }

                td {
                    border-bottom:1px solid #ddd;
                    padding:11px 12px;
                }

                th:first-child,
                td:first-child {
                    text-align:center;
                }

                tr {
                    break-inside:avoid;
                }

                thead {
                    display:table-header-group;
                }

                .footer {
                    margin-top:25px;
                    font-size:11px;
                    color:#666;
                    text-align:center;
                }

                .print-button {
                    display:block;
                    margin:20px auto;
                    padding:12px 24px;
                    background:#c5a253;
                    border:none;
                    border-radius:8px;
                    font-size:15px;
                    font-weight:bold;
                    cursor:pointer;
                }

                @media print {
                    .print-button {
                        display:none;
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
                        <th>Grade</th>
                        <th>Position</th>
                    </tr>
                </thead>

                <tbody>${rows}</tbody>
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


function openLiveCourt() {
  document.querySelector("main").innerHTML = `
    <h2>🏐 Live Match</h2>
    <h3>Lady Knights — Set 1</h3>

    <div class="volleyball-court">
      <div class="court-net">NET</div>

      <div class="court-players">
        <button>Position 4</button>
        <button>Position 3</button>
        <button>Position 2</button>
        <button>Position 5</button>
        <button>Position 6</button>
        <button>Position 1</button>
     
      </div>
    </div>

    <div class="serving-order-panel">
  <h3>🏐 Serving Order</h3>

  

  <div class="next-server-box">
    <strong>NEXT SERVER</strong>
    <p>Not selected</p>
    <small>Made: 0 | Missed: 0</small>
    <small>Aces: 0 | Serve: —</small>
  </div>

  <h4>Serving Rotation</h4>

  <ol class="serving-stats-list">
    <li>Player 1 <small>Made: 0 | Missed: 0</small></li>
    <li>Player 2 <small>Made: 0 | Missed: 0</small></li>
    <li>Player 3 <small>Made: 0 | Missed: 0</small></li>
    <li>Player 4 <small>Made: 0 | Missed: 0</small></li>
    <li>Player 5 <small>Made: 0 | Missed: 0</small></li>
    <li>Player 6 <small>Made: 0 | Missed: 0</small></li>
  </ol>
</div>

<div class="live-stats-dashboard">

  <div class="stats-section">
    <h3>On the Court</h3>

    <div class="live-stats-table-wrapper">
      <table class="live-stats-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Kills</th>
            <th>Digs</th>
            <th>Assists</th>
            <th>Blocks</th>
          </tr>
        </thead>

        <tbody>
          <tr><td>Player 1</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
          <tr><td>Player 2</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
          <tr><td>Player 3</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
          <tr><td>Player 4</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
          <tr><td>Player 5</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
          <tr><td>Player 6</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="stats-section">
    <h3>On the Bench</h3>

    <div id="benchPlayers" class="live-stats-table-wrapper">
      <table class="live-stats-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Kills</th>
            <th>Digs</th>
            <th>Assists</th>
            <th>Blocks</th>
            <th>Substitution</th>
          </tr>
        </thead>

        <tbody>
          ${players.map(player => `
            <tr>
              <td>${player.name || "Unnamed Player"}</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
              <td>—</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </div>

</div>

<button onclick="goHome()">Back to Home</button>
  `;
}
