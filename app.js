
let players = JSON.parse(localStorage.getItem("volleyballPlayers") || "[]");

function savePlayers() {
    localStorage.setItem("volleyballPlayers", JSON.stringify(players));
}

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

function addPlayer() {
    const name = document.getElementById("playerName").value.trim();
    const number = document.getElementById("playerNumber").value.trim();
    const position = document.getElementById("playerPosition").value;

    if (!name || !number || !position) {
        alert("Please complete all player information.");
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

function displayRoster() {
    const rosterList = document.getElementById("rosterList");
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

            const removeButton = document.createElement("button");
            removeButton.textContent = "Remove";
            removeButton.onclick = () => removePlayer(player.id);

            
const editButton = document.createElement("button");
editButton.textContent = "Edit";
editButton.onclick = () => editPlayer(player.id);


const buttonRow = document.createElement("div");
buttonRow.style.display = "flex";
buttonRow.style.gap = "8px";

editButton.style.width = "auto";
editButton.style.padding = "8px 16px";
editButton.style.fontSize = "14px";
editButton.style.margin = "0";
editButton.style.flex = "1";

removeButton.style.width = "auto";
removeButton.style.padding = "8px 16px";
removeButton.style.fontSize = "14px";
removeButton.style.margin = "0";
removeButton.style.flex = "1";

buttonRow.append(editButton, removeButton);
item.append(details, buttonRow);


            rosterList.appendChild(item);
        });
}

function removePlayer(id) {
    if (!confirm("Remove this player from the roster?")) return;

    players = players.filter(player => player.id !== id);
    savePlayers();
    openTeamManager();
}

function goHome() {
    document.querySelector("main").innerHTML = `
        <button>New Match</button>
        <button>Load Match</button>
        <button onclick="openTeamManager()">Team Manager</button>
        <button>Season Stats</button>
        <button>Settings</button>
    `;
}

function editPlayer(id) {
    const player = players.find(p => p.id === id);

    if (!player) return;

    const newName = prompt("Edit Player Name:", player.name);
    if (newName === null) return;

    const newNumber = prompt("Edit Jersey Number:", player.number);
    if (newNumber === null) return;

    const newPosition = prompt(
        "Edit Position (Setter, Outside Hitter, Middle Hitter, Opposite Hitter, Defensive Specialist, Libero):",
        player.position
    );
    if (newPosition === null) return;

    if (!newName.trim() || !newNumber.trim() || !newPosition.trim()) {
        alert("All player information is required.");
        return;
    }

    if (!/^\d+$/.test(newNumber.trim())) {
        alert("Jersey number must contain only numbers.");
        return;
    }

    if (players.some(p => p.id !== id && p.number === newNumber.trim())) {
        alert("That jersey number is already assigned.");
        return;
    }

    const validPositions = [
        "Setter",
        "Outside Hitter",
        "Middle Hitter",
        "Opposite Hitter",
        "Defensive Specialist",
        "Libero"
    ];

    const matchedPosition = validPositions.find(
        position => position.toLowerCase() === newPosition.trim().toLowerCase()
    );

    if (!matchedPosition) {
        alert("Please enter a valid volleyball position.");
        return;
    }

    player.name = newName.trim();
    player.number = newNumber.trim();
    player.position = matchedPosition;

    savePlayers();
    openTeamManager();
}
