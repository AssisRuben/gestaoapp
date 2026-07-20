-- Papel de gestor: acesso de leitura a TODAS as propriedades (atuais e futuras), sem escrita.
--
-- Deliberadamente NÃO reaproveita usuarios_propriedades: aquela tabela concede acesso por
-- fazenda E escrita (toda RPC de escrita só confere "existe vínculo com essa propriedade",
-- nunca olha o papel). Uma tabela separada, sem nenhuma referência a propriedade_id, garante que
-- o gestor nunca aparece nas checagens de autorização das RPCs de escrita — a restrição de
-- "somente leitura" vem de construção, não de uma checagem extra que alguém pode esquecer.
create table gestores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table gestores enable row level security;

create policy "usuario ve seu proprio registro de gestor"
  on gestores for select
  using (usuario_id = auth.uid());

-- Coordenadas de cada fazenda, usadas no mapa do dashboard do gestor. Opcionais (nullable) —
-- fazendas antigas ficam sem pino até alguém preencher no modal da Fazenda.
alter table propriedades add column if not exists latitude numeric;
alter table propriedades add column if not exists longitude numeric;

-- Pra marcar alguém como gestor (rodar manualmente, um de cada vez):
-- insert into gestores (usuario_id) values ('<uuid do usuário em auth.users>');
