import { BCS, TxnBuilderTypes, Types } from "aptos";
import { submitAdminTransaction } from "./useSubmitTransaction";

export async function initGame(
  secsBtwRounds: number,
  buyAmount: number,
  maxPlayers: number,
  numMaxWinners: number,
) {
  return await submitAdminTransaction(
    constructEntryFuncPayload("game_manager", "init_game", [
      BCS.bcsSerializeUint64(secsBtwRounds),
      BCS.bcsSerializeUint64(buyAmount),
      BCS.bcsSerializeUint64(maxPlayers),
      BCS.bcsSerializeUint64(numMaxWinners),
    ]),
  );
}

export async function forceClearPool() {
  return await submitAdminTransaction(
    constructEntryFuncPayload("game_manager", "force_clear_pool", []),
  );
}

export async function advanceGame(
  playerLost: Types.Address[],
  playerWon: Types.Address[],
) {
  // how to serialize vector
  const lostSerializer = new BCS.Serializer();
  const wonSerializer = new BCS.Serializer();
  BCS.serializeVector(
    playerLost.map((p) => TxnBuilderTypes.AccountAddress.fromHex(p)),
    lostSerializer,
  );
  BCS.serializeVector(
    playerWon.map((p) => TxnBuilderTypes.AccountAddress.fromHex(p)),
    wonSerializer,
  );
  return await submitAdminTransaction(
    constructEntryFuncPayload("game_manager", "advance_game", [
      lostSerializer.getBytes(),
      wonSerializer.getBytes(),
    ]),
  );
}

export async function closeJoining() {
  return await submitAdminTransaction(
    constructEntryFuncPayload("game_manager", "close_joining", []),
  );
}

export async function endGame() {
  return await submitAdminTransaction(
    constructEntryFuncPayload("game_manager", "end_game", []),
  );
}

export function constructEntryFuncPayload(
  moduleName: string,
  moduleFunc: string,
  args: Uint8Array[],
): TxnBuilderTypes.TransactionPayloadEntryFunction {
  return new TxnBuilderTypes.TransactionPayloadEntryFunction(
    TxnBuilderTypes.EntryFunction.natural(
      // Fully qualified module name
      `${process.env.CONTRACT_ADDRESS}::${moduleName}`,
      // Module function
      moduleFunc,
      [],
      args,
    ),
  );
}
