const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 3]));

const playersContainer = document.querySelector("#players");
const pileElement = document.querySelector("#pile");
const turnIndicator = document.querySelector("#turn-indicator");
const logElement = document.querySelector("#log");
const restartButton = document.querySelector("#restart");
const playerTemplate = document.querySelector("#player-template");

const state = {
  players: [],
  activeIndex: 0,
  pile: [],
  lastAnchorId: null,
  finishedOrder: [],
  awaitingHuman: false,
};

restartButton.addEventListener("click", () => {
  resetGame();
  startGame();
});

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        value: RANK_VALUE[rank],
        id: `${rank}${suit}`,
      });
    }
  }
  return deck;
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function deal(deck, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, index) => {
    hands[index % playerCount].push(card);
  });
  hands.forEach((hand) => hand.sort((a, b) => a.value - b.value));
  return hands;
}

function resetGame() {
  state.players = [];
  state.activeIndex = 0;
  state.pile = [];
  state.lastAnchorId = null;
  state.finishedOrder = [];
  state.awaitingHuman = false;

  playersContainer.innerHTML = "";
  pileElement.innerHTML = "";
  turnIndicator.textContent = "Loading…";
  logElement.innerHTML = "";
}

function startGame() {
  const deck = shuffle(createDeck());
  const names = ["You", "Bot A", "Bot B", "Bot C"];
  const hands = deal(deck, names.length);

  names.forEach((name, index) => {
    const fragment = playerTemplate.content.cloneNode(true);
    const root = fragment.querySelector(".player");
    const handContainer = fragment.querySelector(".hand");
    const status = fragment.querySelector(".player-status");
    const controls = fragment.querySelector(".player-controls");
    const nameEl = fragment.querySelector(".player-name");

    root.dataset.playerId = String(index);
    nameEl.textContent = name;

    const player = {
      id: index,
      name,
      type: index === 0 ? "human" : "bot",
      hand: hands[index],
      element: {
        root,
        hand: handContainer,
        status,
        controls,
      },
      hasPassed: false,
      finished: false,
    };

    if (player.type === "human") {
      attachHumanControls(player);
    }

    player.element.status.textContent = `${player.hand.length} cards`;
    state.players.push(player);
    playersContainer.appendChild(fragment);
  });

  renderHands();
  showPile();
  logAction("Game", "New round started");
  beginRound();
}

function attachHumanControls(player) {
  const playButton = document.createElement("button");
  playButton.textContent = "Play Selected";
  playButton.disabled = true;

  const passButton = document.createElement("button");
  passButton.textContent = "Pass";
  passButton.disabled = true;

  playButton.addEventListener("click", () => {
    const selected = player.element.hand.querySelector(".card.selected");
    if (!selected) return;

    const cardIndex = Number(selected.dataset.index);
    const card = player.hand[cardIndex];

    if (!canPlayCard(card)) {
      showTempMessage(player, "Cannot play that card yet");
      return;
    }

    playCard(player, [cardIndex]);
  });

  passButton.addEventListener("click", () => {
    performPass(player);
  });

  player.element.controls.append(playButton, passButton);
  player.element.playButton = playButton;
  player.element.passButton = passButton;
}

function renderHands() {
  state.players.forEach((player) => {
    const { hand, element, type, finished } = player;
    const container = element.hand;
    container.innerHTML = "";

    hand.forEach((card, index) => {
      const cardEl = document.createElement("button");
      cardEl.className = "card";
      cardEl.type = "button";
      cardEl.dataset.index = String(index);
      cardEl.dataset.player = type;
      cardEl.textContent = `${card.rank}${card.suit}`;

      if (type === "human" && !finished) {
        cardEl.addEventListener("click", () => {
          selectHumanCard(cardEl, player);
        });
      } else {
        cardEl.disabled = true;
      }

      container.appendChild(cardEl);
    });

    if (hand.length === 0 && !finished) {
      container.textContent = "No cards remaining";
    }
  });
}

function selectHumanCard(cardEl, player) {
  if (!state.awaitingHuman) return;

  const currentlySelected = player.element.hand.querySelector(".card.selected");
  if (currentlySelected && currentlySelected !== cardEl) {
    currentlySelected.classList.remove("selected");
  }

  cardEl.classList.toggle("selected");
  updateHumanControls(player);
}

function beginRound() {
  state.activeIndex = findStartingPlayer();
  state.lastAnchorId = null;
  updateTurnIndicator();
  applyTurnHighlight();
  queueCurrentTurn();
}

function findStartingPlayer() {
  const threeOfClubsId = "3♣";
  const playerWithThree = state.players.find((player) =>
    player.hand.some((card) => card.id === threeOfClubsId)
  );
  return playerWithThree ? playerWithThree.id : 0;
}

function queueCurrentTurn() {
  const player = state.players[state.activeIndex];
  if (!player || player.finished || player.hasPassed) {
    advanceTurn();
    return;
  }

  if (player.type === "bot") {
    disableHumanControls();
    setTimeout(() => handleBotTurn(player), 500);
  } else {
    state.awaitingHuman = true;
    updateHumanControls(player);
  }
}

function handleBotTurn(player) {
  if (player.finished || player.hasPassed) {
    advanceTurn();
    return;
  }

  const playable = getPlayableCards(player);
  if (playable.length === 0) {
    performPass(player);
    return;
  }

  playCard(player, [playable[0]]);
}

function playCard(player, indexes) {
  indexes.sort((a, b) => b - a);
  const playedCards = indexes.map((index) => player.hand.splice(index, 1)[0]);

  state.pile = playedCards;
  state.lastAnchorId = player.id;
  player.hasPassed = false;

  renderHands();
  showPile();
  logAction(player.name, `plays ${formatCards(playedCards)}`);

  if (player.hand.length === 0) {
    markPlayerFinished(player);
  } else {
    player.element.status.textContent = `${player.hand.length} cards`;
  }

  if (isGameFinished()) {
    concludeGame();
    return;
  }

  advanceTurn();
}

function markPlayerFinished(player) {
  player.finished = true;
  player.hasPassed = true;
  player.element.root.classList.add("won");
  state.finishedOrder.push(player.name);
  player.element.status.textContent = `Won (${state.finishedOrder.length}º)`;

  if (player.type === "human") {
    disableHumanControls();
  }
}

function performPass(player) {
  if (player.finished) {
    advanceTurn();
    return;
  }

  if (state.pile.length === 0) {
    showTempMessage(player, "You cannot pass on an empty pile");
    if (player.type === "bot") {
      const playable = getPlayableCards(player);
      if (playable.length > 0) {
        playCard(player, [playable[0]]);
      }
    }
    return;
  }

  player.hasPassed = true;
  logAction(player.name, "passes");

  if (player.type === "human") {
    clearHumanSelection(player);
    disableHumanControls();
  }

  const eligible = getEligiblePlayers();
  if (eligible.length === 1) {
    const winner = eligible[0];
    logAction("Table", `${winner.name} wins the trick. Pile cleared.`);
    clearPileForNewTrick(winner.id);
    state.activeIndex = winner.id;
    updateTurnIndicator();
    applyTurnHighlight();
    queueCurrentTurn();
    return;
  }

  advanceTurn();
}

function clearPileForNewTrick(leaderId) {
  state.pile = [];
  state.lastAnchorId = leaderId;
  state.players.forEach((p) => {
    p.hasPassed = p.finished;
  });
  showPile();
}

function getEligiblePlayers() {
  return state.players.filter((p) => !p.finished && !p.hasPassed);
}

function advanceTurn() {
  if (isGameFinished()) {
    concludeGame();
    return;
  }

  const candidates = getEligiblePlayers();
  if (candidates.length === 0) {
    const leader = state.players.find((p) => p.id === state.lastAnchorId && !p.finished);
    if (leader) {
      clearPileForNewTrick(leader.id);
      state.activeIndex = leader.id;
    } else {
      const nextAlive = state.players.find((p) => !p.finished);
      if (!nextAlive) {
        concludeGame();
        return;
      }
      clearPileForNewTrick(nextAlive.id);
      state.activeIndex = nextAlive.id;
    }
  } else {
    let nextIndex = state.activeIndex;
    let attempts = 0;

    do {
      nextIndex = (nextIndex + 1) % state.players.length;
      attempts += 1;
      if (attempts > state.players.length + 1) break;
    } while (state.players[nextIndex].finished || state.players[nextIndex].hasPassed);

    state.activeIndex = nextIndex;
  }

  updateTurnIndicator();
  applyTurnHighlight();
  queueCurrentTurn();
}

function applyTurnHighlight() {
  state.players.forEach((player) => {
    player.element.root.classList.toggle("current-turn", player.id === state.activeIndex && !player.finished);
  });
}

function updateTurnIndicator() {
  const current = state.players[state.activeIndex];
  turnIndicator.textContent = current ? current.name : "-";
}

function showPile() {
  pileElement.innerHTML = "";
  if (state.pile.length === 0) {
    pileElement.textContent = "Pile is empty";
    return;
  }

  state.pile.forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.textContent = `${card.rank}${card.suit}`;
    pileElement.appendChild(cardEl);
  });
}

function formatCards(cards) {
  return cards.map((card) => `${card.rank}${card.suit}`).join(" ");
}

function getPlayableCards(player) {
  const topCard = state.pile.at(-1);
  const requirement = topCard ? topCard.value : 0;

  const indexes = [];
  player.hand.forEach((card, index) => {
    if (card.value >= requirement) {
      indexes.push(index);
    }
  });
  return indexes;
}

function canPlayCard(card) {
  const topCard = state.pile.at(-1);
  if (!topCard) return true;
  return card.value >= topCard.value;
}

function disableHumanControls() {
  const human = state.players[0];
  if (!human || !human.element.playButton) return;

  human.element.playButton.disabled = true;
  human.element.passButton.disabled = true;
  state.awaitingHuman = false;
}

function updateHumanControls(player) {
  if (!state.awaitingHuman) {
    player.element.playButton.disabled = true;
    player.element.passButton.disabled = true;
    return;
  }

  const selectedEl = player.element.hand.querySelector(".card.selected");
  const selectedCard = selectedEl ? player.hand[Number(selectedEl.dataset.index)] : null;
  player.element.playButton.disabled = !(selectedCard && canPlayCard(selectedCard));
  player.element.passButton.disabled = state.pile.length === 0;
}

function clearHumanSelection(player) {
  player.element.hand.querySelectorAll(".card.selected").forEach((card) => {
    card.classList.remove("selected");
  });
}

function showTempMessage(player, message) {
  const banner = document.createElement("div");
  banner.className = "log-entry";
  banner.textContent = `${player.name}: ${message}`;
  logElement.appendChild(banner);
  logElement.scrollTop = logElement.scrollHeight;
  setTimeout(() => banner.remove(), 1800);
}

function logAction(source, message) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `${source}: ${message}`;
  logElement.appendChild(entry);
  logElement.scrollTop = logElement.scrollHeight;
}

function isGameFinished() {
  return state.players.filter((player) => !player.finished).length <= 1;
}

function concludeGame() {
  const remaining = state.players.find((player) => !player.finished);
  if (remaining) {
    markPlayerFinished(remaining);
  }

  applyTurnHighlight();
  updateTurnIndicator();
  logAction("Game", "Round complete!");
  disableHumanControls();
}

startGame();
