# Together AI

Chat compartilhado: você e seus amigos entram na mesma sala por um link, conversam entre si e com uma IA (Claude), em tempo real.

> **Status honesto:** todo o código foi escrito, mas **ainda não foi instalado, compilado nem executado**. O ambiente onde ele foi criado bloqueou o acesso ao npm, ao Supabase e à API da IA. Veja a seção [O que foi testado](#o-que-foi-testado). Rode o passo 3 (`npm run typecheck`, `npm test`, `npm run build`) antes de publicar — se algo falhar, me mande a mensagem de erro e eu corrijo.

## Como funciona

| Peça | Tecnologia | Para quê |
|---|---|---|
| Site + servidor | Next.js (React + TypeScript) | Telas e rotas de API |
| Banco de dados | Supabase (PostgreSQL) | Salas, participantes, mensagens |
| Tempo real | Supabase Realtime | Mensagens aparecem sem atualizar a página |
| IA | API da Anthropic (Claude) | Responde dentro da sala, em streaming |
| Hospedagem | Vercel | Coloca o site no ar com um link público |

**Identidade (modo simples):** ao entrar, cada pessoa escolhe um apelido e recebe um segredo aleatório guardado no navegador dela. O servidor guarda só o *hash* do segredo. Ninguém consegue se passar por outro só digitando o apelido. A tabela `participants` já tem a coluna `user_id`, pronta para contas no futuro.

**Segurança:** todas as escritas passam pelo servidor (valida tudo, limita frequência). O navegador só *lê* mensagens via Realtime, com um token de 1 hora que vale **só para a própria sala** (regras RLS no banco). A chave da IA e a `service_role` nunca vão ao navegador.

**Sem respostas duplicadas da IA:** o banco tem um índice único que permite no máximo uma resposta de IA por mensagem, e cada sala tem uma trava para uma resposta por vez. Reenviar a mesma mensagem (`clientId`) também não duplica.

## Custos e limites (verificados em 23/10/2026 — confirme nos sites)

- **Vercel Hobby:** grátis, mas **só para uso pessoal e não comercial**; funções até 300 s; 1 milhão de invocações/mês. ([docs](https://vercel.com/docs/plans/hobby))
- **Supabase Free:** segundo uma fonte secundária ([automationatlas.io](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)): 500 MB de banco, 5 GB de banda/mês e **o projeto pausa após 7 dias sem uso** (você reativa no painel). Não consegui confirmar as cotas de Realtime — veja em supabase.com/pricing.
- **API da IA: não é grátis e não está incluída em assinaturas de chatbot.** Precisa de conta e créditos em console.anthropic.com. O modelo padrão (`claude-haiku-5-5`) custa cerca de US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída para prompts até 100 mil tokens ([fonte](https://letsdatascience.com/news/anthropic-releases-claude-haiku-55-with-lower-prices-and-eff-f698c663)). Para conversas de amigos, costuma ser centavos — mas acompanhe o consumo. Sem créditos, o chat entre humanos funciona e a sala mostra um aviso claro no lugar da resposta da IA.

## Passo a passo

### 1. Supabase (banco + tempo real)
1. Crie conta em supabase.com → **New project** (guarde a senha do banco).
2. Menu **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**.
3. Menu **Project Settings → API**: copie **Project URL**, **anon public key** e **service_role key**.
4. Em **Project Settings → API → JWT Settings** (ou "JWT Keys"), copie o **JWT Secret** (legacy). *Se o painel só mostrar chaves assimétricas, me avise: é preciso ajustar `signRealtimeToken`.*

### 2. Chave da IA
1. Em console.anthropic.com crie conta, adicione créditos (**Billing**) e crie uma chave em **API Keys**.
2. Defina um limite mensal de gasto em **Limits**.

### 3. Rodar no seu computador
```bash
cd together-ai
cp .env.example .env.local     # preencha com as chaves dos passos 1 e 2
npm install
npm run typecheck && npm test
npm run dev                    # abra http://localhost:3000
```
Todas as chaves ficam **só** no `.env.local` (que o `.gitignore` já protege).

### 4. Publicar na Vercel
1. Envie a pasta para um repositório no GitHub (sem o `.env.local`).
2. Em vercel.com → **Add New → Project** → escolha o repositório.
3. Em **Environment Variables**, cadastre as mesmas variáveis do `.env.example` (as 5 de Supabase/IA e, se quiser, as de limites).
4. **Deploy**. A Vercel te dá um link como `https://together-ai-xxx.vercel.app`.

### 5. Testar com duas pessoas
1. No celular A abra o site, escolha apelido e **Criar conversa**.
2. Toque em **Convidar → Copiar link** e mande pelo WhatsApp.
3. No aparelho B abra o link, escolha outro apelido e entre.
4. Os dois escrevem ao mesmo tempo: as mensagens devem aparecer nos dois sem recarregar; a IA responde para ambos.
5. Feche e reabra o navegador: o histórico continua. Ative o modo avião por alguns segundos em um aparelho e volte: ele deve se recuperar sozinho.

## O que foi testado

| Item | Situação |
|---|---|
| Lógica de mensagens (ordem, duplicatas, otimista→confirmada, IA em streaming), contexto da IA, validação e tokens | Testes automatizados escritos em `tests/` — **não executados** (sem acesso ao npm) |
| Compilação (`tsc`, `next build`) | **Não executada** |
| Banco, RLS, Realtime, rotas de API | **Não testados** (sem acesso ao Supabase) |
| Chamada à API da IA e streaming | **Não testada** (sem chave nem acesso) |
| Celular + computador, reconexão, acesso sem permissão, falha da IA | **Não testados** — use o roteiro do passo 5 |

Os 14 cenários da sua lista só podem ser considerados prontos depois de você (ou eu, com acesso) executá-los.

## Limitações e privacidade

- **Quem tem o link entra.** Revogue ou gere um novo link em **Convidar** (dono da sala). Não há aprovação manual de entrada.
- **Modo simples = identidade presa ao navegador.** Limpar os dados do navegador ou trocar de aparelho faz perder o acesso à sala (só um novo convite resolve). Contas (Supabase Auth) são o próximo passo natural.
- **Mensagens não têm criptografia ponta a ponta:** ficam legíveis no banco, e o conteúdo é enviado à Anthropic para gerar respostas. Não compartilhe senhas ou dados sensíveis.
- **Exclusão de dados:** o dono pode apagar mensagens, limpar a conversa ou excluir a sala (apaga tudo em cascata). Cada pessoa pode apagar as próprias mensagens.
- O limite de frequência de criar/entrar em sala é em memória (por instância); o de mensagens é no banco.

## Manutenção

- **Nome/aparência:** nome em `src/app/layout.tsx` e `src/app/page.tsx`; cores em `src/app/globals.css` (variáveis `:root`).
- **Modelo/limites da IA:** variáveis `AI_MODEL`, `AI_CONTEXT_MESSAGES`, `AI_MAX_OUTPUT_TOKENS` na Vercel (depois faça **Redeploy**).
- **Erros:** Vercel → seu projeto → **Logs**. **Consumo da IA:** console.anthropic.com → Usage. **Banco:** painel do Supabase.
- **Atualizar sem perder histórico:** publique novas versões do código normalmente (o histórico fica no Supabase). Mudanças no banco devem ser feitas com novos scripts SQL (`alter table …`), nunca recriando as tabelas.

## Estrutura

```
supabase/schema.sql        tabelas, regras de acesso (RLS) e Realtime
src/lib/                   segurança, autenticação, IA, limites
src/lib/client/            hook de tempo real, armazenamento local, mesclagem de mensagens
src/app/api/               rotas do servidor (salas, entrar, mensagens, convites…)
src/app/                   telas: início, /j/<convite>, /chat/<sala>
src/components/            ChatRoom e Markdown seguro
tests/                     testes automatizados (vitest)
```
