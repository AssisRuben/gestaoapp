-- Esquema ORIGINAL do banco, como estava antes da migration 0001 (tabelas criadas na época em que
-- só existia o bot de WhatsApp). As migrations em supabase/migrations/ partem deste estado.
--
-- NÃO rodar na produção (as tabelas já existem lá). Serve pra montar um banco novo do zero —
-- homologação e testes: ver deploy/HOMOLOGACAO.md e scripts/montar-banco.js.
--
-- Reconstruído a partir do esquema documentado no CLAUDE.md, sem as colunas que as migrations
-- acrescentam depois (latitude/longitude, touro_semen, touro_id, dose_programa, periodo, autoria,
-- lembretes...). FKs sem cascade, como na produção (deletar_vaca conta com a recusa por FK).

create table if not exists propriedades (
  id uuid primary key default gen_random_uuid(),
  nome_propriedade text not null,
  nome_produtor text not null,
  municipio text,
  estado text,
  tecnico_responsavel text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists vacas (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id),
  mae_id uuid references vacas(id),
  status_produtivo text,
  status_reprodutivo text,
  data_parto date,
  numero_identificacao integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists coberturas (
  id uuid primary key default gen_random_uuid(),
  vaca_id uuid not null references vacas(id),
  data_cobertura date not null,
  diagnostico_prenhez text default 'pendente',
  created_at timestamptz default now()
);

create table if not exists partos (
  id uuid primary key default gen_random_uuid(),
  vaca_id uuid not null references vacas(id),
  cobertura_id uuid references coberturas(id),
  data_parto date not null,
  producao_total numeric,
  projecao_305 numeric,
  persistencia numeric,
  dias_em_aberto integer,
  iep integer,
  created_at timestamptz default now(),
  ativa boolean not null default true
);

create table if not exists bezerros (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id),
  parto_id uuid references partos(id),
  mae_id uuid references vacas(id),
  vaca_id_gerada uuid references vacas(id),
  numero_identificacao integer,
  sexo text check (sexo = any (array['macho'::text, 'femea'::text, 'natimorto'::text])),
  data_nascimento date,
  created_at timestamptz default now()
);

create table if not exists controle_leite (
  id uuid primary key default gen_random_uuid(),
  vaca_id uuid not null references vacas(id),
  parto_id uuid not null references partos(id),
  litros numeric not null,
  data_controle date not null,
  created_at timestamptz default now()
);

create table if not exists financeiro (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id),
  tipo text not null check (tipo = any (array['receita'::text, 'despesa'::text])),
  categoria text,
  valor numeric not null,
  data date not null,
  created_at timestamptz default now()
);
create index if not exists idx_financeiro_propriedade_data on financeiro (propriedade_id, data);

create table if not exists patrimonio (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id),
  tipo_ativo text,
  valor_total numeric,
  taxa_juros numeric,
  vida_util integer,
  created_at timestamptz default now()
);

create table if not exists usuarios_whatsapp (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id),
  telefone text not null unique,
  papel text not null default 'produtor',
  ativo boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists interacoes_log (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid references propriedades(id),
  intencao_detectada text,
  entidades_extraidas jsonb,
  mensagem_recebida text,
  resposta_enviada text,
  created_at timestamptz default now()
);
