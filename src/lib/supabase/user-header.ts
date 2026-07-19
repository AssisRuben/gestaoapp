// Nome do header que o middleware (proxy.ts) usa pra repassar o id do usuário
// já validado (via getUser()) pros Server Components, evitando que eles
// precisem chamar getUser() de novo — outro round-trip à API de Auth.
export const USER_ID_HEADER = "x-user-id";
