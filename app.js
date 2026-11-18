
let players = JSON.parse(localStorage.getItem("volleyballPlayers") || "[]");

// SAVE PLAYERS
function savePlayers() {
    localStorage.setItem("volleyballPlayers", JSON.stringify(players));
}

// TEAM MANAGER
function openTeamManager() {
    document.querySelector("main").innerHTML = `
        <h2>Team Manager</h2>

        <input id="playerName" placeholder="Player Name">
        <input id="playerNumber" type="number" placeholder="Jersey Number">

        <select id="playerPosition">
            <option value="">Select Position</option>
            <option>Setter</option>
            <option>Outside Hitter</option>
            <option>Middle Hitter</option>
            <option>Opposite Hitter</option>
            <option>Defensive Specialist</option>
            <option>Libero</option>
        </select>

        <button onclick="addPlayer()">Add Player</button>

        <h3>Team Roster</h3>
        <div id="rosterList"></div>

        <button onclick="goHome()">Back to Home</button>
    `;

    displayRoster();
}

// ADD PLAYER
function addPlayer() {
    const name = document.getElementById("playerName").value.trim();
    const number = document.getElementById("playerNumber").value.trim();
    const position = document.getElementById("playerPosition").value;

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
        .sort((a, b) => Number(a.number) - Number(b.number))
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

            // EDIT BUTTON
            const editButton = document.createElement("button");
            editButton.textContent = "Edit";
            editButton.onclick = () => editPlayer(player.id);

            // REMOVE BUTTON
            const removeButton = document.createElement("button");
            removeButton.textContent = "Remove";
            removeButton.onclick = () => removePlayer(player.id);

            // SIDE-BY-SIDE BUTTONS
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

            buttonRow.append(editButton, removeButton);
            item.append(details, buttonRow);

            rosterList.appendChild(item);
        });
}

// REMOVE PLAYER
function removePlayer(id) {
    if (!confirm("Remove this player from the roster?")) return;

    players = players.filter(player => player.id !== id);

    savePlayers();
    openTeamManager();
}

// EDIT PLAYER SCREEN
function editPlayer(id) {
    const player = players.find(p => p.id === id);
    if (!player) return;

    window.editingPlayerId = id;

    document.querySelector("main").innerHTML = `
        <h2>Edit Player</h2>

        <label for="editName">Player Name</label>
        <input id="editName" placeholder="Player Name">

        <label for="editNumber">Jersey Number</label>
        <input id="editNumber" type="number" placeholder="Jersey Number">

        <label for="editPosition">Position</label>
        <select id="editPosition">
            <option>Setter</option>
            <option>Outside Hitter</option>
            <option>Middle Hitter</option>
            <option>Opposite Hitter</option>
            <option>Defensive Specialist</option>
            <option>Libero</option>
        </select>

        <button onclick="savePlayerEdit()">Save Changes</button>
        <button onclick="openTeamManager()">Cancel</button>
    `;

    document.getElementById("editName").value = player.name;
    document.getElementById("editNumber").value = player.number;
    document.getElementById("editPosition").value = player.position;
}

// SAVE PLAYER EDITS
function savePlayerEdit() {
    const player = players.find(
        p => p.id === window.editingPlayerId
    );

    if (!player) return;

    const name = document.getElementById("editName").value.trim();
    const number = document.getElementById("editNumber").value.trim();
    const position = document.getElementById("editPosition").value;

    if (!name || !number || !position) {
        alert("Please complete all player information.");
        return;
    }

    if (!/^\d+$/.test(number)) {
        alert("Please enter a valid jersey number.");
        return;
    }

    if (players.some(p => p.id !== player.id && p.number === number)) {
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
        <button onclick="openTeamManager()">Team Manager</button>
        <button>Season Stats</button>
        <button>Settings</button>
    `;
}
