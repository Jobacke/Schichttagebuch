/**
 * Kommunikation mit dem Board (board.vjbackhaus.de), wenn das Schichttagebuch dort eingebettet ist.
 * Nachrichten gehen nur an das echte Board, und nur Antworten vom echten Board werden angenommen –
 * so kann keine fremde Seite, die die App einbettet, Token oder Anmeldedaten abgreifen oder unterschieben.
 */
export const BOARD_ORIGIN = 'https://board.vjbackhaus.de';

export function isEmbedded() {
  try {
    return typeof window !== 'undefined' && !!window.parent && window.parent !== window;
  } catch {
    return false;
  }
}

export function postToBoard(message) {
  if (!isEmbedded()) return;
  try {
    // Der Browser stellt die Nachricht nur zu, wenn das umgebende Fenster wirklich das Board ist
    window.parent.postMessage(message, BOARD_ORIGIN);
  } catch {}
}

export function isFromBoard(event) {
  return !!event && event.origin === BOARD_ORIGIN && event.source === window.parent;
}
