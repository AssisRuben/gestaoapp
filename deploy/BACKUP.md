# Backup do banco (GitHub Actions)

Workflow `.github/workflows/backup.yml`: todo dia às 03:00 (Fortaleza) faz o dump do banco de
produção, criptografa e guarda como artefato na aba **Actions** por **30 dias**.

## Configurar (uma vez)

1. **URI do banco:** Supabase → botão **Connect** → **Session pooler** → copie a URI
   (`postgresql://postgres.xxxx:[SENHA]@aws-0-...pooler.supabase.com:5432/postgres`) e troque
   `[SENHA]` pela senha do banco. Use o *Session pooler*: a conexão direta não funciona do GitHub.
2. **Senha do backup:** invente uma senha longa (16+ caracteres). **Guarde fora do GitHub** (gerenciador
   de senhas). Sem ela, o backup não abre — nem por você.
3. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = a URI do passo 1
   - `BACKUP_PASSPHRASE` = a senha do passo 2
4. **Actions → Backup do banco → Run workflow** pra testar. Deve terminar verde e mostrar o artefato
   `gestaopec-banco-AAAA-MM-DD`.

## O que entra

- Esquemas `public` (fazendas, rebanho, leite, financeiro...), `auth` (contas) e `storage` (só o
  registro dos arquivos).
- **Não entram** os arquivos do Storage (fotos do botijão). Se perder o projeto, os registros voltam
  mas as fotos não.

## Restaurar

Precisa do Docker (ou do `pg_restore` 17 instalado) e do `gpg`.

1. Actions → execução do dia → baixe o artefato (vem em `.zip`) e extraia `banco.dump.gpg`.
2. Abrir: `gpg --output banco.dump --decrypt banco.dump.gpg` (pede a senha).
3. Num Supabase **novo** (nunca por cima da produção sem antes conferir): pegue a URI do Session pooler
   e rode
   ```
   docker run --rm -v "$PWD:/b" postgres:17 pg_restore --no-owner --no-privileges \
     --clean --if-exists -d "URI_DO_BANCO_NOVO" /b/banco.dump
   ```
   Avisos de objetos do próprio Supabase (já existentes no projeto novo) são esperados.
4. Confira as contagens (vacas, leite, financeiro) contra o que se espera antes de apontar o site.

Ensaie a restauração uma vez num projeto de teste: backup que nunca foi restaurado é suposição.

## Cuidados

- O repositório é público: o artefato pode ser baixado por qualquer conta do GitHub. Por isso ele só
  sai criptografado. **Nunca** tire o passo de criptografia.
- Workflow agendado em repositório público é **desligado pelo GitHub após 60 dias sem commits**. O
  GitHub manda e-mail avisando; reative em Actions.
- Trocou a senha do banco no Supabase? Atualize o secret `SUPABASE_DB_URL`.
- Execução que falhar: o GitHub manda e-mail pro dono do repositório.
