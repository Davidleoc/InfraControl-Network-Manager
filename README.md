# InfraControl Network Manager 🌐🚀

Sistema moderno, proativo e totalmente customizável para gestão e inventário de rede, integrado com Jira Service Management (Assets/Insight) e autenticação AD/LDAP.

## ✨ Funcionalidades Principais

- **Autenticação Corporativa**: Integração com Microsoft Active Directory (LDAP).
- **Inventário em Tempo Real**: Sincronização automática de VLANs e Segmentos via Jira Assets.
- **Portal de Ativos (Nomes de Ativo)**: Gestão completa de hostnames, hardware e localização.
- **Autodiscovery Proativo**: Varredura automática que percorre a rede para identificar IPs ativos e registros DNS.
- **Interface Premium**: Dashboard moderno com busca inteligente, filtros avançados (Letras/País) e suporte a Temas (Dark/Light).
- **Altamente Customizável**: Nome do portal, subtítulos e tipos de ativos configuráveis via ambiente.

---

## 🧰 Linguagens e Tecnologias

![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

**Linguagens**
- **JavaScript (ES Modules + JSX)** — todo o código, front-end e back-end
- **CSS3** — estilização própria com variáveis CSS e temas claro/escuro (sem framework)
- **SQL (SQLite)** — tabela de histórico/auditoria
- **IQL (Insight Query Language)** — consultas ao CMDB do Jira Assets
- **Bash / Dockerfile / YAML** — empacotamento e implantação

**Stack**
| Camada | Tecnologia |
| :--- | :--- |
| Framework full-stack | Next.js 16 (App Router, API Routes, Middleware, build `standalone`) |
| Interface | React 19 + [lucide-react](https://lucide.dev) (ícones) |
| Runtime | Node.js 20 |
| Autenticação | LDAP / Active Directory (`ldapjs`) + sessão JWT em cookie HttpOnly (`jose`) |
| Persistência | SQLite (`sqlite3`) para histórico + arquivos JSON para estados e cache |
| Integração CMDB | Jira Service Management Assets/Insight (REST API) |
| Rede | `ping` (ICMP) e DNS reverso/direto nativos do Node (`dns/promises`) |
| Relatórios | `exceljs` (planilhas .xlsx) + `nodemailer` (envio SMTP) |
| Implantação | Docker multi-stage (`node:20-slim`) + Docker Compose |

---

### 🐳 Deploy no Ubuntu via Docker (Passo a Passo)

Para uma instalação limpa e organizada em servidores Ubuntu, recomendamos a seguinte estrutura de diretórios em `/opt`:

#### 1. Estrutura Recomendada de Diretórios
```bash
/opt/gerenciador-ips/
├── .env                # Configurações sensíveis (Jira, LDAP, JWT, e-mail)
├── emails.txt          # Destinatários do backup semanal
├── docker-compose.yml  # Definição dos serviços
└── data/               # Volume persistente para o banco SQLite e caches
```

#### 2. Preparando o Ambiente
```bash
# Crie o diretório do projeto e ajuste as permissões
sudo mkdir -p /opt/gerenciador-ips/data
sudo chown -R $USER:$USER /opt/gerenciador-ips 
ou chown -R 1000:1000 data
chmod -R 755 data

# Acesse a pasta
cd /opt/gerenciador-ips
```

#### 3. Configuração e Deploy
1. **Clone o Repositório:** 
   ```bash
   git clone https://github.com/<seu-usuario>/<seu-repositorio>.git .
   ```

2. **Configure o Ambiente:** 
   ```bash
   cp .env.example .env
   cp emails.example.txt emails.txt
   nano .env   # preencha Jira, LDAP, JWT_SECRET e SMTP do seu ambiente
   ```

3. **Suba o Container:** 
   Execute o build e inicie em modo daemon:
   ```bash
   docker-compose up -d --build
   ```

4. **Logs e Verificação:**
   ```bash
   docker-compose logs -f
   ```
   Acesse em: `http://<ip-do-servidor>:3000`

---

## 🛠️ Variáveis de Ambiente

Todas as configurações ficam no arquivo `.env` (modelo completo em `.env.example`):

| Variável | Descrição | Exemplo / Padrão |
| :---

## 🗄️ Banco de Dados e Persistência

O sistema utiliza uma arquitetura híbrida para persistência de dados, combinando um banco de dados relacional leve para registros históricos e arquivos JSON para estados dinâmicos.

### 1. SQLite (Histórico de Alterações)
Localizado em `data/database.sqlite`, este banco é responsável por auditar todas as mudanças de status no inventário.

**O que o banco grava na tabela `history`:**
- **Tipo de Ativo:** Se a mudança foi em um IP ou em um Nome de Ativo (HOSTNAME).
- **Identificador:** O endereço IP ou a chave única do CMDB (Jira Key).
- **Transição de Status:** O status anterior (`oldStatus`) e o novo status (`newStatus`).
- **Autor da Mudança:** O nome de usuário do administrador que realizou a ação (capturado via sessão LDAP).
- **Data e Hora:** Timestamp exato da operação (`updatedAt`).
- **Detalhes:** Informações contextuais adicionais sobre a operação.

> [!NOTE]
> **Manutenção Automática:** Para evitar o crescimento excessivo do arquivo, o sistema realiza uma limpeza automática, removendo registros de histórico com mais de **90 dias**.

### 2. Arquivos JSON (Estados e Cache)
Para dados de consulta rápida e controle de processos, o sistema utiliza arquivos JSON na raiz e na pasta `data/`:
- `manual_ip_status.json`: Armazena status que foram definidos manualmente pelos usuários e que devem ser preservados.
- `scan-status.json`: Controla o progresso e o status da última varredura automática (scanner de 4h).
- `ip_status_history.json`: Mantém o histórico rápido de estados de rede para consulta em tempo real na interface de IPs.

---

## 📜 Regras de Funcionamento e Lógica do Sistema

Para garantir a precisão do inventário, o sistema segue um conjunto de regras automáticas de validação e prioridade:

### 1. Detecção de Uso (IPs e Hostnames)
O sistema utiliza uma validação híbrida:
- **Conectividade (Ping):** Tenta alcançar o destino via ICMP. Se responder, é marcado como **Online**.
- **Resolução DNS (PTR):** Consulta registros de DNS reverso para identificar nomes associados ao IP. No Node.js, utiliza-se o método `dns.reverse()`.
- **Status "Em Uso":** Um IP/Hostname é considerado ocupado se responder ao Ping **OU** possuir registro no DNS.

> [!TIP]
> **Comando Manual de DNS:** Para checar o DNS de um IP via terminal (Windows/Linux), use:
> ```bash
> nslookup [ENDEREÇO_IP]
> ```

### 2. Prioridade do CMDB e Status "Reservado"
- **Status Reservado:** IPs marcados manualmente como "Reservado" possuem imunidade contra o scanner automático. O sistema **não** irá alterá-los para "Em Uso" sozinho para evitar conflitos durante provisionamentos de rede.
- **Sincronização CMDB/Jira:** O status "Reservado" só é alterado quando o Jira reporta a mudança oficial (via integração Assets) ou por ação manual do usuário.
- **Correção de Conflitos:** Se o CMDB reporta que um ativo está "Livre", mas a varredura de rede detecta que o IP/Nome responde (Ping Online), a ferramenta força o status para **"Em Uso"** para prevenir erros de alocação.

### 3. Ciclo de Vida e Cache
- **Scanner Global (Background):** Uma varredura completa em todas as VLANs cadastradas ocorre automaticamente **uma vez por dia, às 04:00 da manhã**. Este horário foi escolhido para minimizar o impacto nos usuários e garantir que o inventário esteja atualizado no início do expediente.
- **Performance:** O scanner utiliza uma técnica de *throttling* (limitação de lotes e pausas controladas) para garantir que o sistema continue extremamente rápido e responsivo, mesmo enquanto a varredura está em execução.
- **Cache de Rede:** Os estados de Ping e DNS são armazenados localmente para otimizar a performance.
- **Checagem Instantânea:** O botão "Escanear" (ícone de recarregar) na interface ignora o agendamento e realiza a validação em tempo real para o item selecionado.

### 4. Lógica de Sorteio (V3)
- Ao realizar um sorteio, o sistema filtra todos os IPs da VLAN desejada e todos os Nomes de Ativo que estejam com o status "Disponível" no Jira e na rede. A seleção do par é feita de forma **aleatória (randomizada)**.

---

## 🚀 Histórico de Versões e Metas

O sistema evoluiu para priorizar a integridade do inventário e a facilidade de uso operacional.

### Versão 4.2.1 (Atual)
**Foco: Refinamento de UX e Auditoria**
- **Auditoria Consistente**: Padronização visual da coluna "Identificador" no histórico para facilitar a leitura rápida, alinhando a tipografia com os nomes dos editores (Remoção da fonte monoespaçada).
- **Identificação de Rede Avançada**: Inclusão do "Range" e da "Descrição CMDB" diretamente na listagem de VLANs da aba de IPs, permitindo identificar o propósito da rede (ex: Servidores de Validação) logo no resumo.
- **Fluxo de Trabalho Restritivo**: Remoção da opção de marcar manualmente como "Livre" ou "Disponível". O sistema agora permite apenas a **Reserva Manual**, deixando que o scanner automático cuide da detecção de uso real, garantindo 100% de confiabilidade no inventário.

### Versão 4.1.0
**Foco: Visualização e Contexto**
- **Dashboard Reformulado**: Nova interface para a aba de IPs com suporte a expansão de VLANs e carregamento em lotes.
- **Box de Informação CMDB**: Implementação do box de descrição de rede seguindo o padrão oficial do Jira Insights nas seleções.

### Versão 3.x (Legacy)
- Implementação do sistema de sorteio (Randomizer).
- Integração inicial com LDAP e Jira Assets.

---

## 🚀 Desenvolvimento Local

Se desejar rodar fora do Docker:

1. Instale as dependências: `npm install`
2. Copie `.env.example` para `.env.local` e preencha
3. Inicie o servidor: `npm run dev`

---

*Desenvolvido para ambientes de rede escaláveis e dinâmicos.*
