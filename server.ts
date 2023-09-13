import express, { Express } from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { advanceGame, endGame, forceClearPool, initGame } from "./sdk";
import { AptosClient, Types } from "aptos";

dotenv.config();

interface PlayerStateView {
  is_alive: boolean;
  wins: number;
  nft_uri: string;
  potential_winning: number;
  token_index: number;
}
interface LatestPlayerState {
  [address: string]: PlayerStateView;
}

interface GameState {
  pool: number;
  latestPlayerState: LatestPlayerState;
  maxPlayer: number;
  numBtwSecs: number;
  buyIn: number;
  joinable: boolean;
  playable: boolean;
  round: number;
  numMaxWinner: number;
}

interface PlayerScore {
  [address: string]: number;
}

type Score = {
  address: string;
  score: number;
};

export const app: Express = express();
const server = http.createServer(app);

const port = process.env.PORT || 8000;

app.use(express.json());
app.use(cors());

// initialize
let playerScore: PlayerScore = {};
let gameState: GameState = {
  pool: -1,
  latestPlayerState: {},
  maxPlayer: -1,
  numBtwSecs: -1,
  round: 0,
  joinable: false,
  playable: false,
  buyIn: -1,
  numMaxWinner: 1
};
let viewFunctionTimestamp = Date.now();
let roundTimestamp = Date.now();

app.post("/send_score", (req, res) => {
  try {
    const requestBody = req.body as Score;

    const address = requestBody.address;
    const score = requestBody.score;
    console.log("Got Score", address, score);

    if (address in playerScore) {
      // do nothing cuz we just persist the first score to avoid cheating
    } else {
      playerScore[address] = score;
    }

    return res.status(200).json({ message: "Success" });
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return res.status(400).json({ error: "Invalid JSON in the request body." });
  }
});

app.get('/view_state', async (req, res) => {
  return res.send(JSON.stringify(gameState));
})

app.get("/init_game", async (req, res) => {
  await forceClearPool();
  try {
    await initGame(Number(process.env.SECOND_BTW_ROUNDS), Number(process.env.BUY_AMOUNT), Number(process.env.MAX_PLAYER), Number(process.env.MAX_WINNER));
  } catch (e) {
    console.error("Error init game:", e);
  } finally {
    res.send("Game started");
  }
});

app.get("/start_game", async (req, res) => {
  await advanceGame([], []);
  roundTimestamp = Date.now()
  return res.status(200).json('Game started...');
})

async function updateGameState() {
  viewFunctionTimestamp = Date.now();
  const state = await viewGameState();

  const viewState: GameState = {
    pool: 0,
    latestPlayerState: {},
    maxPlayer: 0,
    numBtwSecs: 0,
    buyIn: 0,
    joinable: false,
    playable: false,
    round: 0,
    numMaxWinner: 1
  };

  const localState: LatestPlayerState = {};

  // @ts-ignore
  state[0].latest_player_states.data.map((object)=> {
    localState[object.key] = object.value;
  })

  // @ts-ignore
  viewState.buyIn = state[0].buy_in;
  // @ts-ignore
  viewState.joinable = state[0].joinable;
  // @ts-ignore
  viewState.latestPlayerState = localState;
  // @ts-ignore
  viewState.maxPlayer = state[0].max_players;
  // @ts-ignore
  viewState.playable = state[0].playable;
  // @ts-ignore
  viewState.pool = state[0].pool;
  // @ts-ignore
  viewState.round = state[0].round;
  // @ts-ignore
  viewState.numBtwSecs = state[0].secs_between_rounds;
  // @ts-ignore
  viewState.numMaxWinner = state[0].num_max_winners;
  
  gameState = deepCopy(viewState);
}

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

async function runGameLogic() {
  await updateGameState();

  if (gameState.joinable || !gameState.playable) {
    console.log('Join stage or no game');
    return;
  }
  
  let alivePlayerCount = {num: 0};
  Object.entries(gameState.latestPlayerState).map(([addr, playerView]) => {
    if (playerView.is_alive) {
      alivePlayerCount.num += 1;
    }
  })

  if (alivePlayerCount.num <= gameState.numMaxWinner) {
    await endGame();
    return;
  }

  let wonPlayer: string[] = [];
  let lostPlayer: string[] = [];

  // loop through playerState
  console.log('blH', playerScore);

  let score = {score: 0, num: 0};
  Object.entries(playerScore).map((obj) => {
    score.score += obj[1];
    score.num ++;
  })

  const avg = score.score / score.num;
  
  console.log('AVG', avg);

  Object.entries(gameState.latestPlayerState).forEach(([addr, playerState]) => {
    if (playerState.is_alive) {
      if (playerScore[addr] <= avg) {
        wonPlayer.push(addr);
      } else {
        lostPlayer.push(addr);
      }
    }
  });

  if (wonPlayer.length === 0 ) {
    console.log('Did not get any winners');
    return;
  }

  await advanceGame(lostPlayer, wonPlayer);
  playerScore = {};
}

async function main() {
  while (true) {
    const currTimestamp = Date.now()
    if (currTimestamp - viewFunctionTimestamp >= 500) { // 1 sec
      await updateGameState();
    }
    const gameStarted = !gameState.joinable && gameState.playable;
    if (currTimestamp - roundTimestamp >= gameState?.numBtwSecs*1000 && gameStarted) {
      console.log('time diff', currTimestamp - roundTimestamp);
      await runGameLogic();
    }
  }
}

export async function viewGameState(): Promise<Types.MoveValue[]> {
  const payload: Types.ViewRequest = {
    function: `${process.env.CONTRACT_ADDRESS}::game_manager::view_game_states`,
    type_arguments: [],
    arguments: [],
  };
  const client = new AptosClient(process.env.NETWORK || "");
  return client.view(payload);
}

server.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

main();