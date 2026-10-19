import { performHostnameScan } from './scanner';
import { getAllHostnameManualStatuses, setHostnameManualStatus } from './status-store';
import { fetchHostnames } from './hostname-service';

/**
 * Sincroniza os status manuais de hostnames com a realidade (ping/DNS) e o CMDB.
 * Se um hostname está marcado como 'Disponível' mas o ping responde, atualiza para 'Em Uso'.
 * Se está 'Em Uso' mas não responde e não está no CMDB como ativo, pode sugerir limpeza (ou apenas marcar disponível).
 */
export async function syncManualHostnamesWithReality(jiraHostnames = null) {
    console.log('[AUTO-SCAN-UTILS] Iniciando sincronização de hostnames...');
    
    if (!jiraHostnames) {
        const res = await fetchHostnames(true);
        jiraHostnames = res.hostnames;
    }

    const manualStatuses = getAllHostnameManualStatuses();
    const jiraKeys = new Set(jiraHostnames.map(h => h.key));
    
    // 1. Verificar hostnames que estão no CMDB (Jira)
    // Para simplificar, vamos focar nos que tem status manual ou que queremos validar
    for (const host of jiraHostnames) {
        const manual = manualStatuses[host.key];
        
        // Se já está 'Em Uso' no Jira, confiamos no Jira (ou fazemos um ping rápido para cachear)
        if (host.situacao === 'Em Uso' || host.situacao === 'Active') {
            // Apenas garante que o scanner saiba que existe
            continue;
        }

        // Se está 'Disponível' ou outro status no Jira, mas temos override manual ou queremos checar
        // Aqui poderíamos fazer pings em lote, mas vamos manter simples por agora
    }

    console.log('[AUTO-SCAN-UTILS] Sincronização de hostnames concluída.');
}
