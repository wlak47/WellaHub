const allGames = [
  { id: 570, name: 'Dota 2', total: '12.4', boosted: '0.8' },
  { id: 730, name: 'Counter-Strike 2', total: '86.2', boosted: '1.4' },
  { id: 1172470, name: 'Apex Legends', total: '24.8', boosted: '0.3' },
  { id: 230410, name: 'Warframe', total: '31.6', boosted: '0.5' },
  { id: 2767030, name: 'Marvel Rivals', total: '8.1', boosted: '0.2' },
  { id: 440, name: 'Team Fortress 2', total: '43.0', boosted: '0.7' }
];
const demoAccounts = ['WellaHub', 'Wella_alt', 'WellaFriends', 'SteamPlayer', 'PinkPlayer', 'WellaCoop', 'NightArcade'];
const side = document.getElementById('side'), cards = document.getElementById('cards');
demoAccounts.forEach((name, i) => {
  const holder = document.createElement('div'); holder.className = 'sitem';
  const button = document.createElement('button'); button.className = 'sbtn' + (i === 0 ? ' active' : ''); button.title = name; button.textContent = name.slice(0, 1);
  if (i === 0) { button.style.background = 'linear-gradient(140deg,#f16caa,#572e70)'; button.style.color = '#fff'; }
  const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = '#3ddc97';
  button.addEventListener('click', () => { side.querySelectorAll('.sbtn').forEach((b) => b.classList.remove('active')); button.classList.add('active'); document.querySelector('.head h1').textContent = `${i === 0 ? 7 : 3} accounts boosting`; });
  holder.append(button, dot); side.append(holder);
});
const add = document.createElement('div'); add.className = 'sitem'; const plus = document.createElement('button'); plus.className = 'sbtn'; plus.textContent = '+'; plus.title = 'Add account'; plus.addEventListener('click', () => alert('Preview mode · account sign-in is disabled.')); add.append(plus); side.append(add);
function renderBoost() {
  document.getElementById('viewBoost').classList.remove('hidden');
  document.querySelector('.main').innerHTML = `<div class="demo-label"><b>PREVIEW MODE</b> · Fictional WellaHub account and sample playtime. Nothing connects to Steam.</div><div class="head"><h1>7 accounts boosting</h1><div class="head-actions"><button class="btn ghost sm" data-demo="Rotate games">Rotate games: Off</button><button class="btn start sm" data-demo="Start all">Start all</button><button class="btn stop sm" data-demo="Stop all">Stop all</button></div></div><div id="cards"></div>`;
  const target = document.getElementById('cards');
  demoAccounts.forEach((account, index) => {
    const visibleGames = index === 0 ? allGames : allGames.slice(index % 3, (index % 3) + 4);
    const gameMarkup = visibleGames.map((g) => `<div class="g"><img class="gimg" src="https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.id}/header.jpg" alt="" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22460%22 height=%22215%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%231d1020%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 fill=%22%23ff9bce%22 font-size=%2240%22 text-anchor=%22middle%22 font-family=%22Arial%22%3E${encodeURIComponent(g.name.slice(0, 2))}%3C/text%3E%3C/svg%3E'"><div class="gn"><b>★ ${g.name}</b></div><div class="hrs"><span class="steamhrs">${g.total}</span><i class="steamunit">h</i><span class="boostedhrs">${g.boosted}</span><i>h</i></div></div>`).join('');
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<div class="row"><div class="avw"><div class="av" style="display:grid;place-items:center;background:linear-gradient(140deg,#f16caa,#572e70);color:white;font-weight:700">${account[0]}</div><span class="dot ok"></span></div><div class="who"><b>${account}</b><small>${visibleGames.length} games · Online</small></div><div class="stat"><small>This session</small><div>03:42</div></div><div class="stat"><small>Total</small><div>128:16</div></div><button class="btn stop" data-demo="Stop ${account}">Stop</button><button class="icon" title="Choose games" data-demo="Choose games">✎</button><button class="icon" title="Account info" data-demo="Account info">⋯</button></div><div class="cdsum"><b>0 card drops remaining</b><span>0 games left to idle, 0 idle now.</span><em>Currently in-game</em></div><div class="games">${gameMarkup}</div>`;
    target.append(card);
  });
  document.getElementById('viewBoost').classList.add('shell');
}
function renderPage(page) {
  const shell = document.getElementById('viewBoost');
  shell.classList.remove('hidden');
  if (page === 'boost') { renderBoost(); return; }
  const main = document.querySelector('#viewBoost .main');
  if (page === 'ach') main.innerHTML = `<div class="demo-label"><b>PREVIEW MODE</b> · Sample library only.</div><div class="head"><h1>Achievement Manager</h1></div><div class="demo-preview-controls"><input class="in" placeholder="Search games"><button class="btn ghost">Select all</button></div><div class="glist">${allGames.map((g, i) => `<div class="gi"><img src="https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.id}/header.jpg" onerror="this.style.opacity='.25'"><span>${g.name}</span><small>${42 + i * 9} achievements</small></div>`).join('')}</div><div class="empty">Pick a game on the left. Sign in in the desktop app to see your library.</div>`;
  else if (page === 'free') main.innerHTML = `<div class="demo-label"><b>PREVIEW MODE</b> · Example free games. Search and filters are visual only.</div><div class="head"><h1>Free Games</h1></div><div class="demo-preview-controls"><input class="in" placeholder="Search all free games by name…"><button class="btn ghost">Relevance⌄</button><button class="btn ghost">Account⌄</button></div><div class="demo-free-grid">${allGames.map((g) => `<article class="demo-free-card"><div class="art" style="--hue:${(g.id * 47) % 360}">${g.name}</div><b>${g.name}</b><small>Free to play</small><button class="btn ghost sm" style="margin:5px 10px">Store</button></article>`).join('')}</div>`;
  else main.innerHTML = `<div class="demo-label"><b>PREVIEW MODE</b></div><div class="head"><h1>Settings</h1></div><div class="modal settings" style="display:flex;position:static;width:100%;max-height:none"><h2>General</h2><button class="btn ghost">Appearance</button><button class="btn ghost">Background</button><button class="btn ghost">Tabs &amp; monitor</button><button class="btn ghost">Startup</button><button class="btn ghost">Web access</button></div>`;
}
function activateTab(button) { document.querySelectorAll('.top .tab').forEach((item) => item.classList.toggle('active', item === button)); const indicator = document.getElementById('ind'); indicator.style.left = button.offsetLeft + 'px'; indicator.style.width = button.offsetWidth + 'px'; }
document.querySelectorAll('.top .tab').forEach((button) => button.addEventListener('click', () => { activateTab(button); renderPage(button.dataset.view); }));
requestAnimationFrame(() => activateTab(document.querySelector('.top .tab.active')));
document.getElementById('settings').addEventListener('click', () => { document.querySelectorAll('.top .tab').forEach((item) => item.classList.remove('active')); document.getElementById('ind').style.width = '0px'; renderPage('settings'); });
document.getElementById('search').addEventListener('click', () => alert('Preview mode · Search is available in the installed app.'));
document.body.addEventListener('click', (event) => { const b = event.target.closest('[data-demo]'); if (b) alert(`Preview mode · “${b.dataset.demo}” does not control your PC.`); });
renderBoost();
