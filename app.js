
function openTeamManager() {
    document.querySelector("main").innerHTML = `
        <h2>Team Manager</h2>
        <p>Manage your volleyball roster here.</p>

        <button onclick="goHome()">Back to Home</button>
    `;
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

