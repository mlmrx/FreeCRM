export const languageCatalog = [
  { locale: 'en-US', name: 'English', nativeName: 'English', direction: 'ltr' },
  { locale: 'es-ES', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  { locale: 'fr-FR', name: 'French', nativeName: 'Français', direction: 'ltr' },
  { locale: 'pt-BR', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' },
  { locale: 'de-DE', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  { locale: 'ar-SA', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
] as const;

export type SupportedLocale = (typeof languageCatalog)[number]['locale'];
export type TextDirection = (typeof languageCatalog)[number]['direction'];
export const defaultLocale: SupportedLocale = 'en-US';

const english = {
  'language.label': 'Language',
  'language.workspaceHelp': 'Language is saved for this workspace and used for dates and money.',
  'landing.skip': 'Skip intro',
  'landing.pause': 'Pause animation',
  'landing.resume': 'Resume animation',
  'landing.about': 'About FREE CRM',
  'landing.navigation': 'FREE CRM navigation',
  'landing.how': 'How it works',
  'landing.insights': 'Insights',
  'landing.explore': 'Explore',
  'landing.platform': 'Platform',
  'landing.tour': 'Product tour',
  'landing.contribute': 'Contribute',
  'landing.workspace': 'Owner workspace',
  'landing.kicker': 'A customer operating system for one',
  'landing.findPath': 'Find my path',
  'landing.guidance': 'A little guidance. A path of your own.',
  'landing.replay': 'Replay the eagle',
  'landing.openSource': 'Open source on GitHub',
  'landing.freeForever': 'Free for all. Free forever.',
  'landing.origin': 'Built in California · yours everywhere',
  'landing.customers': 'Your customers.',
  'landing.craft': 'Your craft.',
  'landing.data': 'Your data.',
  'landing.aboutBody': 'One private place for relationships, selling, work, billing, service, documents and decisions. Open source, without a subscription.',
  'landing.deploy': 'Deploy your own',
  'landing.readInsights': 'Read FREE CRM Insights',
  'landing.contributionGuide': 'Contribution guide',
  'landing.viewGithub': 'View on GitHub',
  'common.close': 'Close',
  'common.new': 'New {item}',
  'state.opening': 'Opening FREE CRM',
  'state.loading': 'Loading your private workspace and live reports…',
  'state.unavailable': 'Workspace unavailable',
  'state.retry': 'Try again',
  'state.signIn': 'Sign in to FREE CRM',
  'state.continueGithub': 'Continue with GitHub',
  'nav.close': 'Close navigation',
  'nav.open': 'Open navigation',
  'nav.label': 'CRM navigation',
  'nav.home': 'Home',
  'nav.relationships': 'Relationships',
  'nav.sales': 'Sales',
  'nav.work': 'Work',
  'nav.growth': 'Growth',
  'nav.service': 'Service',
  'nav.operate': 'Operate',
  'nav.secondBrain': 'Second brain',
  'nav.today': 'Today',
  'nav.reports': 'Reports',
  'nav.workflows': 'Workflows',
  'nav.integrations': 'Integrations',
  'nav.agents': 'Agents',
  'nav.settings': 'Settings',
  'nav.how': 'How it works',
  'module.lead': 'Leads',
  'module.contact': 'Contacts',
  'module.company': 'Companies',
  'module.opportunity': 'Opportunities',
  'module.activity': 'Activities',
  'module.task': 'Tasks',
  'module.campaign': 'Campaigns',
  'module.product': 'Products',
  'module.quote': 'Quotes',
  'module.invoice': 'Invoices',
  'module.ticket': 'Tickets',
  'module.document': 'Documents',
  'module.manage': 'Manage {items}, statuses, and the context stored in this workspace.',
  'view.dashboard.title': 'Good work starts here',
  'view.dashboard.subtitle': 'Your relationships, revenue, and promises in one place.',
  'view.reports.title': 'Reports & analytics',
  'view.reports.subtitle': 'Live answers from the same records that power your day.',
  'view.workflows.title': 'Workflows',
  'view.workflows.subtitle': 'Small, dependable automations with recent run history.',
  'view.integrations.title': 'Apps & integrations',
  'view.integrations.subtitle': 'Connect deliberately. Nothing is shown as connected until it really is.',
  'view.agents.title': 'Humans + agents',
  'view.agents.subtitle': 'Constrained assistance with approvals, budgets, receipts, and an emergency stop.',
  'view.admin.title': 'Settings & system',
  'view.admin.subtitle': 'Workspace controls, audit history, exports, and platform health.',
  'workspace.search': 'Search active records…',
  'workspace.searchLabel': 'Search active CRM records',
  'workspace.noMatches': 'No matching records',
  'workspace.loaded': 'Workspace loaded · {when}',
  'workspace.system': 'FREE CRM OPERATING SYSTEM',
  'workspace.demoTitle': 'Demo workspace',
  'workspace.demoBody': 'a complete lead-to-cash story is loaded so every module is useful.',
  'workspace.startClean': 'Start clean',
  'onboarding.eyebrow': 'SET UP YOUR WORKSPACE',
  'onboarding.title': 'How will you use FREE CRM?',
  'onboarding.body': 'Choose a calm starting point. Profiles only change defaults—your data always stays in the same workspace.',
  'onboarding.personal': 'Personal / solo',
  'onboarding.personalHelp': 'Personal and solopreneur essentials',
  'onboarding.business': 'Business profile',
  'onboarding.businessHelp': 'Single-owner sales and service defaults',
  'onboarding.enterprise': 'Enterprise profile',
  'onboarding.enterpriseHelp': 'Higher limits; one owner, with agent policy controls',
  'onboarding.ready': 'Your workspace is ready. You can change this profile any time.',
  'dashboard.openPipeline': 'Open pipeline',
  'dashboard.weighted': '{amount} weighted',
  'dashboard.revenueWon': 'Revenue won',
  'dashboard.closedOpportunities': 'Closed opportunities',
  'dashboard.outstanding': 'Outstanding',
  'dashboard.overdueAmount': '{amount} overdue',
  'dashboard.needsAttention': 'Needs attention',
  'dashboard.attentionNote': '{tasks} overdue · {tickets} tickets',
  'dashboard.today': 'TODAY',
  'dashboard.commitments': 'Your commitments',
  'dashboard.addTask': 'Add task',
  'dashboard.forecast': 'FORECAST',
  'dashboard.pipelineShape': 'Pipeline shape',
  'dashboard.openBoard': 'Open board →',
  'dashboard.signals': 'CUSTOMER SIGNALS',
  'dashboard.recentActivity': 'Recent activity',
  'dashboard.viewAll': 'View all →',
  'dashboard.soloFocus': 'SOLO FOCUS',
  'dashboard.calmSystem': 'One calm system',
  'dashboard.focusBody': 'Active CRM records and reports live in one workspace. Explicit conversion links appear in Customer 360.',
  'dashboard.taskCompletion': 'task completion',
  'dashboard.leadConversion': 'lead conversion',
  'dashboard.exploreInsights': 'Explore insights',
  'date.never': 'Never',
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
  'date.inDays': 'In {count} day(s)',
  'date.daysAgo': '{count} days ago',
  'admin.workspace': 'WORKSPACE',
  'admin.profileDefaults': 'Profile & defaults',
  'admin.workspaceName': 'Workspace name',
  'admin.workStyle': 'How do you work?',
  'admin.currency': 'Currency',
  'admin.save': 'Save settings',
  'admin.saved': 'Workspace language and profile saved without moving your data.',
} as const;

export type TranslationKey = keyof typeof english;
type Dictionary = Partial<Record<TranslationKey, string>>;

const spanish: Dictionary = {
  'language.label': 'Idioma', 'language.workspaceHelp': 'El idioma se guarda para este espacio de trabajo y se usa en fechas y monedas.',
  'landing.skip': 'Omitir introducción', 'landing.pause': 'Pausar animación', 'landing.resume': 'Reanudar animación', 'landing.about': 'Acerca de FREE CRM', 'landing.navigation': 'Navegación de FREE CRM', 'landing.how': 'Cómo funciona', 'landing.insights': 'Ideas', 'landing.explore': 'Explorar', 'landing.platform': 'Plataforma', 'landing.tour': 'Recorrido del producto', 'landing.contribute': 'Contribuir', 'landing.workspace': 'Espacio del propietario', 'landing.kicker': 'Un sistema operativo de clientes para una persona', 'landing.findPath': 'Encontrar mi camino', 'landing.guidance': 'Un poco de orientación. Un camino propio.', 'landing.replay': 'Repetir el águila', 'landing.openSource': 'Código abierto en GitHub', 'landing.freeForever': 'Gratis para todos. Gratis para siempre.', 'landing.origin': 'Creado en California · tuyo en todas partes', 'landing.customers': 'Tus clientes.', 'landing.craft': 'Tu trabajo.', 'landing.data': 'Tus datos.', 'landing.aboutBody': 'Un lugar privado para relaciones, ventas, trabajo, facturación, servicio, documentos y decisiones. Código abierto, sin suscripción.', 'landing.deploy': 'Despliega el tuyo', 'landing.readInsights': 'Leer FREE CRM Insights', 'landing.contributionGuide': 'Guía de contribución', 'landing.viewGithub': 'Ver en GitHub',
  'common.close': 'Cerrar', 'common.new': 'Nuevo: {item}', 'state.opening': 'Abriendo FREE CRM', 'state.loading': 'Cargando tu espacio privado y los informes…', 'state.unavailable': 'Espacio no disponible', 'state.retry': 'Intentar de nuevo', 'state.signIn': 'Inicia sesión en FREE CRM', 'state.continueGithub': 'Continuar con GitHub',
  'nav.close': 'Cerrar navegación', 'nav.open': 'Abrir navegación', 'nav.label': 'Navegación del CRM', 'nav.home': 'Inicio', 'nav.relationships': 'Relaciones', 'nav.sales': 'Ventas', 'nav.work': 'Trabajo', 'nav.growth': 'Crecimiento', 'nav.service': 'Servicio', 'nav.operate': 'Operar', 'nav.secondBrain': 'Segundo cerebro', 'nav.today': 'Hoy', 'nav.reports': 'Informes', 'nav.workflows': 'Flujos de trabajo', 'nav.integrations': 'Integraciones', 'nav.agents': 'Agentes', 'nav.settings': 'Configuración', 'nav.how': 'Cómo funciona',
  'module.lead': 'Prospectos', 'module.contact': 'Contactos', 'module.company': 'Empresas', 'module.opportunity': 'Oportunidades', 'module.activity': 'Actividades', 'module.task': 'Tareas', 'module.campaign': 'Campañas', 'module.product': 'Productos', 'module.quote': 'Presupuestos', 'module.invoice': 'Facturas', 'module.ticket': 'Casos', 'module.document': 'Documentos', 'module.manage': 'Gestiona {items}, estados y el contexto guardado en este espacio.',
  'view.dashboard.title': 'El buen trabajo empieza aquí', 'view.dashboard.subtitle': 'Tus relaciones, ingresos y compromisos en un solo lugar.', 'view.reports.title': 'Informes y análisis', 'view.reports.subtitle': 'Respuestas en vivo desde los mismos registros que impulsan tu día.', 'view.workflows.title': 'Flujos de trabajo', 'view.workflows.subtitle': 'Automatizaciones pequeñas y confiables con historial reciente.', 'view.integrations.title': 'Aplicaciones e integraciones', 'view.integrations.subtitle': 'Conecta de forma deliberada. Nada aparece conectado hasta que realmente lo está.', 'view.agents.title': 'Personas + agentes', 'view.agents.subtitle': 'Asistencia limitada con aprobaciones, presupuestos, recibos y parada de emergencia.', 'view.admin.title': 'Configuración y sistema', 'view.admin.subtitle': 'Controles, auditoría, exportaciones y estado de la plataforma.',
  'workspace.search': 'Buscar registros activos…', 'workspace.searchLabel': 'Buscar registros activos del CRM', 'workspace.noMatches': 'No hay registros coincidentes', 'workspace.loaded': 'Espacio cargado · {when}', 'workspace.system': 'SISTEMA OPERATIVO FREE CRM',
  'workspace.demoTitle': 'Espacio de demostración', 'workspace.demoBody': 'se ha cargado una historia completa desde el prospecto hasta el cobro para que cada módulo sea útil.', 'workspace.startClean': 'Empezar limpio',
  'onboarding.eyebrow': 'CONFIGURA TU ESPACIO', 'onboarding.title': '¿Cómo usarás FREE CRM?', 'onboarding.body': 'Elige un punto de partida sencillo. Los perfiles solo cambian los valores predeterminados; tus datos permanecen en el mismo espacio.', 'onboarding.personal': 'Personal / individual', 'onboarding.personalHelp': 'Lo esencial para una persona o profesional independiente', 'onboarding.business': 'Perfil de negocio', 'onboarding.businessHelp': 'Ventas y servicio para un único propietario', 'onboarding.enterprise': 'Perfil empresarial', 'onboarding.enterpriseHelp': 'Límites mayores; un propietario, con controles de políticas de agentes', 'onboarding.ready': 'Tu espacio está listo. Puedes cambiar este perfil cuando quieras.',
  'dashboard.openPipeline': 'Pipeline abierto', 'dashboard.weighted': '{amount} ponderado', 'dashboard.revenueWon': 'Ingresos ganados', 'dashboard.closedOpportunities': 'Oportunidades cerradas', 'dashboard.outstanding': 'Pendiente', 'dashboard.overdueAmount': '{amount} vencido', 'dashboard.needsAttention': 'Necesita atención', 'dashboard.attentionNote': '{tasks} vencidas · {tickets} casos', 'dashboard.today': 'HOY', 'dashboard.commitments': 'Tus compromisos', 'dashboard.addTask': 'Añadir tarea', 'dashboard.forecast': 'PREVISIÓN', 'dashboard.pipelineShape': 'Forma del pipeline', 'dashboard.openBoard': 'Abrir tablero →', 'dashboard.signals': 'SEÑALES DE CLIENTES', 'dashboard.recentActivity': 'Actividad reciente', 'dashboard.viewAll': 'Ver todo →', 'dashboard.soloFocus': 'ENFOQUE PERSONAL', 'dashboard.calmSystem': 'Un sistema tranquilo', 'dashboard.focusBody': 'Los registros e informes activos viven en un espacio. Los vínculos de conversión aparecen en Customer 360.', 'dashboard.taskCompletion': 'tareas completadas', 'dashboard.leadConversion': 'conversión de prospectos', 'dashboard.exploreInsights': 'Explorar análisis',
  'date.never': 'Nunca', 'date.today': 'Hoy', 'date.yesterday': 'Ayer', 'date.inDays': 'En {count} día(s)', 'date.daysAgo': 'Hace {count} días',
  'admin.workspace': 'ESPACIO DE TRABAJO', 'admin.profileDefaults': 'Perfil y valores predeterminados', 'admin.workspaceName': 'Nombre del espacio', 'admin.workStyle': '¿Cómo trabajas?', 'admin.currency': 'Moneda', 'admin.save': 'Guardar configuración', 'admin.saved': 'Idioma y perfil guardados sin mover tus datos.',
};

const french: Dictionary = {
  'language.label': 'Langue', 'language.workspaceHelp': 'La langue est enregistrée pour cet espace et utilisée pour les dates et les montants.',
  'landing.skip': "Passer l’introduction", 'landing.pause': "Mettre l’animation en pause", 'landing.resume': "Reprendre l’animation", 'landing.about': 'À propos de FREE CRM', 'landing.navigation': 'Navigation FREE CRM', 'landing.how': 'Fonctionnement', 'landing.insights': 'Analyses', 'landing.explore': 'Explorer', 'landing.platform': 'Plateforme', 'landing.tour': 'Visite du produit', 'landing.contribute': 'Contribuer', 'landing.workspace': 'Espace propriétaire', 'landing.kicker': 'Un système client conçu pour une personne', 'landing.findPath': 'Trouver mon parcours', 'landing.guidance': 'Quelques repères. Un parcours qui vous appartient.', 'landing.replay': "Rejouer l’aigle", 'landing.openSource': 'Open source sur GitHub', 'landing.freeForever': 'Gratuit pour tous. Pour toujours.', 'landing.origin': 'Créé en Californie · à vous partout', 'landing.customers': 'Vos clients.', 'landing.craft': 'Votre métier.', 'landing.data': 'Vos données.', 'landing.aboutBody': 'Un espace privé pour les relations, les ventes, le travail, la facturation, le service, les documents et les décisions. Open source, sans abonnement.', 'landing.deploy': 'Déployer le vôtre', 'landing.readInsights': 'Lire FREE CRM Insights', 'landing.contributionGuide': 'Guide de contribution', 'landing.viewGithub': 'Voir sur GitHub',
  'common.close': 'Fermer', 'common.new': 'Nouveau : {item}', 'state.opening': 'Ouverture de FREE CRM', 'state.loading': 'Chargement de votre espace privé et des rapports…', 'state.unavailable': 'Espace indisponible', 'state.retry': 'Réessayer', 'state.signIn': 'Se connecter à FREE CRM', 'state.continueGithub': 'Continuer avec GitHub',
  'nav.close': 'Fermer la navigation', 'nav.open': 'Ouvrir la navigation', 'nav.label': 'Navigation CRM', 'nav.home': 'Accueil', 'nav.relationships': 'Relations', 'nav.sales': 'Ventes', 'nav.work': 'Travail', 'nav.growth': 'Croissance', 'nav.service': 'Service', 'nav.operate': 'Opérer', 'nav.secondBrain': 'Second cerveau', 'nav.today': "Aujourd’hui", 'nav.reports': 'Rapports', 'nav.workflows': 'Automatisations', 'nav.integrations': 'Intégrations', 'nav.agents': 'Agents', 'nav.settings': 'Paramètres', 'nav.how': 'Fonctionnement',
  'module.lead': 'Prospects', 'module.contact': 'Contacts', 'module.company': 'Entreprises', 'module.opportunity': 'Opportunités', 'module.activity': 'Activités', 'module.task': 'Tâches', 'module.campaign': 'Campagnes', 'module.product': 'Produits', 'module.quote': 'Devis', 'module.invoice': 'Factures', 'module.ticket': 'Tickets', 'module.document': 'Documents', 'module.manage': 'Gérez les {items}, leurs statuts et le contexte conservé dans cet espace.',
  'view.dashboard.title': 'Le bon travail commence ici', 'view.dashboard.subtitle': 'Vos relations, vos revenus et vos engagements au même endroit.', 'view.reports.title': 'Rapports et analyses', 'view.reports.subtitle': 'Des réponses en direct à partir des registres de votre quotidien.', 'view.workflows.title': 'Automatisations', 'view.workflows.subtitle': 'De petites automatisations fiables avec leur historique récent.', 'view.integrations.title': 'Applications et intégrations', 'view.integrations.subtitle': 'Connectez délibérément. Rien n’est indiqué comme connecté avant de l’être vraiment.', 'view.agents.title': 'Humains + agents', 'view.agents.subtitle': 'Une assistance encadrée par des approbations, budgets, reçus et un arrêt d’urgence.', 'view.admin.title': 'Paramètres et système', 'view.admin.subtitle': 'Contrôles, audit, exportations et santé de la plateforme.',
  'workspace.search': 'Rechercher dans les registres actifs…', 'workspace.searchLabel': 'Rechercher dans les registres CRM actifs', 'workspace.noMatches': 'Aucun registre correspondant', 'workspace.loaded': 'Espace chargé · {when}', 'workspace.system': 'SYSTÈME D’EXPLOITATION FREE CRM',
  'workspace.demoTitle': 'Espace de démonstration', 'workspace.demoBody': 'un parcours complet du prospect au paiement est chargé pour rendre chaque module utile.', 'workspace.startClean': 'Repartir à zéro',
  'onboarding.eyebrow': 'CONFIGUREZ VOTRE ESPACE', 'onboarding.title': 'Comment utiliserez-vous FREE CRM ?', 'onboarding.body': 'Choisissez un point de départ simple. Les profils ne changent que les valeurs par défaut ; vos données restent dans le même espace.', 'onboarding.personal': 'Personnel / solo', 'onboarding.personalHelp': 'L’essentiel pour une personne indépendante', 'onboarding.business': 'Profil professionnel', 'onboarding.businessHelp': 'Ventes et service pour un propriétaire unique', 'onboarding.enterprise': 'Profil entreprise', 'onboarding.enterpriseHelp': 'Limites supérieures ; un propriétaire, avec des contrôles de politique pour les agents', 'onboarding.ready': 'Votre espace est prêt. Vous pouvez changer ce profil à tout moment.',
  'dashboard.openPipeline': 'Pipeline ouvert', 'dashboard.weighted': '{amount} pondéré', 'dashboard.revenueWon': 'Revenus gagnés', 'dashboard.closedOpportunities': 'Opportunités conclues', 'dashboard.outstanding': 'À recevoir', 'dashboard.overdueAmount': '{amount} en retard', 'dashboard.needsAttention': 'À surveiller', 'dashboard.attentionNote': '{tasks} en retard · {tickets} tickets', 'dashboard.today': "AUJOURD’HUI", 'dashboard.commitments': 'Vos engagements', 'dashboard.addTask': 'Ajouter une tâche', 'dashboard.forecast': 'PRÉVISION', 'dashboard.pipelineShape': 'Forme du pipeline', 'dashboard.openBoard': 'Ouvrir le tableau →', 'dashboard.signals': 'SIGNAUX CLIENTS', 'dashboard.recentActivity': 'Activité récente', 'dashboard.viewAll': 'Tout voir →', 'dashboard.soloFocus': 'FOCUS SOLO', 'dashboard.calmSystem': 'Un système serein', 'dashboard.focusBody': 'Les registres actifs et les rapports vivent dans un seul espace. Les liens de conversion apparaissent dans Customer 360.', 'dashboard.taskCompletion': 'tâches terminées', 'dashboard.leadConversion': 'conversion des prospects', 'dashboard.exploreInsights': 'Explorer les analyses',
  'date.never': 'Jamais', 'date.today': "Aujourd’hui", 'date.yesterday': 'Hier', 'date.inDays': 'Dans {count} jour(s)', 'date.daysAgo': 'Il y a {count} jours',
  'admin.workspace': 'ESPACE DE TRAVAIL', 'admin.profileDefaults': 'Profil et valeurs par défaut', 'admin.workspaceName': "Nom de l’espace", 'admin.workStyle': 'Comment travaillez-vous ?', 'admin.currency': 'Devise', 'admin.save': 'Enregistrer', 'admin.saved': 'Langue et profil enregistrés sans déplacer vos données.',
};

const portuguese: Dictionary = {
  'language.label': 'Idioma', 'language.workspaceHelp': 'O idioma é salvo neste espaço e usado em datas e valores.',
  'landing.skip': 'Pular introdução', 'landing.pause': 'Pausar animação', 'landing.resume': 'Retomar animação', 'landing.about': 'Sobre o FREE CRM', 'landing.navigation': 'Navegação do FREE CRM', 'landing.how': 'Como funciona', 'landing.insights': 'Insights', 'landing.explore': 'Explorar', 'landing.platform': 'Plataforma', 'landing.tour': 'Tour do produto', 'landing.contribute': 'Contribuir', 'landing.workspace': 'Espaço do proprietário', 'landing.kicker': 'Um sistema operacional de clientes para uma pessoa', 'landing.findPath': 'Encontrar meu caminho', 'landing.guidance': 'Um pouco de orientação. Um caminho só seu.', 'landing.replay': 'Repetir a águia', 'landing.openSource': 'Código aberto no GitHub', 'landing.freeForever': 'Grátis para todos. Para sempre.', 'landing.origin': 'Criado na Califórnia · seu em qualquer lugar', 'landing.customers': 'Seus clientes.', 'landing.craft': 'Seu trabalho.', 'landing.data': 'Seus dados.', 'landing.aboutBody': 'Um lugar privado para relacionamentos, vendas, trabalho, faturamento, atendimento, documentos e decisões. Código aberto, sem assinatura.', 'landing.deploy': 'Implante o seu', 'landing.readInsights': 'Leia o FREE CRM Insights', 'landing.contributionGuide': 'Guia de contribuição', 'landing.viewGithub': 'Ver no GitHub',
  'common.close': 'Fechar', 'common.new': 'Novo: {item}', 'state.opening': 'Abrindo o FREE CRM', 'state.loading': 'Carregando seu espaço privado e relatórios…', 'state.unavailable': 'Espaço indisponível', 'state.retry': 'Tentar novamente', 'state.signIn': 'Entrar no FREE CRM', 'state.continueGithub': 'Continuar com o GitHub',
  'nav.close': 'Fechar navegação', 'nav.open': 'Abrir navegação', 'nav.label': 'Navegação do CRM', 'nav.home': 'Início', 'nav.relationships': 'Relacionamentos', 'nav.sales': 'Vendas', 'nav.work': 'Trabalho', 'nav.growth': 'Crescimento', 'nav.service': 'Atendimento', 'nav.operate': 'Operar', 'nav.secondBrain': 'Segundo cérebro', 'nav.today': 'Hoje', 'nav.reports': 'Relatórios', 'nav.workflows': 'Automações', 'nav.integrations': 'Integrações', 'nav.agents': 'Agentes', 'nav.settings': 'Configurações', 'nav.how': 'Como funciona',
  'module.lead': 'Leads', 'module.contact': 'Contatos', 'module.company': 'Empresas', 'module.opportunity': 'Oportunidades', 'module.activity': 'Atividades', 'module.task': 'Tarefas', 'module.campaign': 'Campanhas', 'module.product': 'Produtos', 'module.quote': 'Orçamentos', 'module.invoice': 'Faturas', 'module.ticket': 'Chamados', 'module.document': 'Documentos', 'module.manage': 'Gerencie {items}, status e o contexto salvo neste espaço.',
  'view.dashboard.title': 'O bom trabalho começa aqui', 'view.dashboard.subtitle': 'Seus relacionamentos, receita e compromissos em um só lugar.', 'view.reports.title': 'Relatórios e análises', 'view.reports.subtitle': 'Respostas ao vivo a partir dos mesmos registros que movem o seu dia.', 'view.workflows.title': 'Automações', 'view.workflows.subtitle': 'Automações pequenas e confiáveis com histórico recente.', 'view.integrations.title': 'Aplicativos e integrações', 'view.integrations.subtitle': 'Conecte com intenção. Nada aparece como conectado antes de realmente estar.', 'view.agents.title': 'Pessoas + agentes', 'view.agents.subtitle': 'Assistência controlada por aprovações, orçamentos, recibos e parada de emergência.', 'view.admin.title': 'Configurações e sistema', 'view.admin.subtitle': 'Controles, auditoria, exportações e integridade da plataforma.', 'workspace.search': 'Pesquisar registros ativos…', 'workspace.searchLabel': 'Pesquisar registros ativos do CRM', 'workspace.noMatches': 'Nenhum registro encontrado', 'workspace.loaded': 'Espaço carregado · {when}', 'workspace.system': 'SISTEMA OPERACIONAL FREE CRM',
  'workspace.demoTitle': 'Espaço de demonstração', 'workspace.demoBody': 'uma jornada completa do lead ao pagamento foi carregada para tornar todos os módulos úteis.', 'workspace.startClean': 'Começar limpo',
  'onboarding.eyebrow': 'CONFIGURE SEU ESPAÇO', 'onboarding.title': 'Como você usará o FREE CRM?', 'onboarding.body': 'Escolha um ponto de partida tranquilo. Os perfis só alteram padrões; seus dados permanecem no mesmo espaço.', 'onboarding.personal': 'Pessoal / individual', 'onboarding.personalHelp': 'O essencial para uma pessoa ou profissional independente', 'onboarding.business': 'Perfil de negócios', 'onboarding.businessHelp': 'Vendas e atendimento para um único proprietário', 'onboarding.enterprise': 'Perfil empresarial', 'onboarding.enterpriseHelp': 'Limites maiores; um proprietário, com controles de políticas de agentes', 'onboarding.ready': 'Seu espaço está pronto. Você pode mudar este perfil quando quiser.',
  'dashboard.openPipeline': 'Pipeline aberto', 'dashboard.weighted': '{amount} ponderado', 'dashboard.revenueWon': 'Receita ganha', 'dashboard.closedOpportunities': 'Oportunidades fechadas', 'dashboard.outstanding': 'Pendente', 'dashboard.overdueAmount': '{amount} vencido', 'dashboard.needsAttention': 'Precisa de atenção', 'dashboard.attentionNote': '{tasks} atrasadas · {tickets} chamados', 'dashboard.today': 'HOJE', 'dashboard.commitments': 'Seus compromissos', 'dashboard.addTask': 'Adicionar tarefa', 'dashboard.forecast': 'PREVISÃO', 'dashboard.pipelineShape': 'Formato do pipeline', 'dashboard.openBoard': 'Abrir quadro →', 'dashboard.signals': 'SINAIS DE CLIENTES', 'dashboard.recentActivity': 'Atividade recente', 'dashboard.viewAll': 'Ver tudo →', 'dashboard.soloFocus': 'FOCO PESSOAL', 'dashboard.calmSystem': 'Um sistema tranquilo', 'dashboard.focusBody': 'Os registros ativos e os relatórios vivem em um só espaço. Os vínculos de conversão aparecem no Customer 360.', 'dashboard.taskCompletion': 'tarefas concluídas', 'dashboard.leadConversion': 'conversão de leads', 'dashboard.exploreInsights': 'Explorar insights',
  'date.never': 'Nunca', 'date.today': 'Hoje', 'date.yesterday': 'Ontem', 'date.inDays': 'Em {count} dia(s)', 'date.daysAgo': 'Há {count} dias',
  'admin.workspace': 'ESPAÇO DE TRABALHO', 'admin.profileDefaults': 'Perfil e padrões', 'admin.workspaceName': 'Nome do espaço', 'admin.workStyle': 'Como você trabalha?', 'admin.currency': 'Moeda', 'admin.save': 'Salvar configurações', 'admin.saved': 'Idioma e perfil salvos sem mover seus dados.',
};

const german: Dictionary = {
  'language.label': 'Sprache', 'language.workspaceHelp': 'Die Sprache wird für diesen Arbeitsbereich gespeichert und für Datum und Währung verwendet.',
  'landing.skip': 'Intro überspringen', 'landing.pause': 'Animation pausieren', 'landing.resume': 'Animation fortsetzen', 'landing.about': 'Über FREE CRM', 'landing.navigation': 'FREE CRM Navigation', 'landing.how': 'So funktioniert es', 'landing.insights': 'Einblicke', 'landing.explore': 'Entdecken', 'landing.platform': 'Plattform', 'landing.tour': 'Produkttour', 'landing.contribute': 'Mitwirken', 'landing.workspace': 'Eigener Arbeitsbereich', 'landing.kicker': 'Ein Kundensystem für eine Person', 'landing.findPath': 'Meinen Weg finden', 'landing.guidance': 'Ein wenig Orientierung. Ein eigener Weg.', 'landing.replay': 'Adler erneut abspielen', 'landing.openSource': 'Open Source auf GitHub', 'landing.freeForever': 'Für alle kostenlos. Für immer.', 'landing.origin': 'In Kalifornien entwickelt · überall deins', 'landing.customers': 'Deine Kunden.', 'landing.craft': 'Dein Handwerk.', 'landing.data': 'Deine Daten.', 'landing.aboutBody': 'Ein privater Ort für Beziehungen, Vertrieb, Arbeit, Abrechnung, Service, Dokumente und Entscheidungen. Open Source, ohne Abonnement.', 'landing.deploy': 'Eigene Instanz bereitstellen', 'landing.readInsights': 'FREE CRM Insights lesen', 'landing.contributionGuide': 'Leitfaden zum Mitwirken', 'landing.viewGithub': 'Auf GitHub ansehen',
  'common.close': 'Schließen', 'common.new': 'Neu: {item}', 'state.opening': 'FREE CRM wird geöffnet', 'state.loading': 'Privater Arbeitsbereich und Berichte werden geladen…', 'state.unavailable': 'Arbeitsbereich nicht verfügbar', 'state.retry': 'Erneut versuchen', 'state.signIn': 'Bei FREE CRM anmelden', 'state.continueGithub': 'Mit GitHub fortfahren',
  'nav.close': 'Navigation schließen', 'nav.open': 'Navigation öffnen', 'nav.label': 'CRM-Navigation', 'nav.home': 'Start', 'nav.relationships': 'Beziehungen', 'nav.sales': 'Vertrieb', 'nav.work': 'Arbeit', 'nav.growth': 'Wachstum', 'nav.service': 'Service', 'nav.operate': 'Betrieb', 'nav.secondBrain': 'Zweites Gehirn', 'nav.today': 'Heute', 'nav.reports': 'Berichte', 'nav.workflows': 'Workflows', 'nav.integrations': 'Integrationen', 'nav.agents': 'Agenten', 'nav.settings': 'Einstellungen', 'nav.how': 'So funktioniert es',
  'module.lead': 'Leads', 'module.contact': 'Kontakte', 'module.company': 'Unternehmen', 'module.opportunity': 'Verkaufschancen', 'module.activity': 'Aktivitäten', 'module.task': 'Aufgaben', 'module.campaign': 'Kampagnen', 'module.product': 'Produkte', 'module.quote': 'Angebote', 'module.invoice': 'Rechnungen', 'module.ticket': 'Tickets', 'module.document': 'Dokumente', 'module.manage': '{items}, Status und den Kontext dieses Arbeitsbereichs verwalten.',
  'view.dashboard.title': 'Gute Arbeit beginnt hier', 'view.dashboard.subtitle': 'Beziehungen, Umsatz und Zusagen an einem Ort.', 'view.reports.title': 'Berichte und Analysen', 'view.reports.subtitle': 'Direkte Antworten aus denselben Datensätzen, die deinen Tag antreiben.', 'view.workflows.title': 'Workflows', 'view.workflows.subtitle': 'Kleine, verlässliche Automatisierungen mit aktuellem Verlauf.', 'view.integrations.title': 'Apps und Integrationen', 'view.integrations.subtitle': 'Bewusst verbinden. Nichts gilt als verbunden, bevor es das wirklich ist.', 'view.agents.title': 'Menschen + Agenten', 'view.agents.subtitle': 'Begrenzte Unterstützung mit Freigaben, Budgets, Belegen und Not-Aus.', 'view.admin.title': 'Einstellungen und System', 'view.admin.subtitle': 'Arbeitsbereich, Auditverlauf, Exporte und Plattformstatus.', 'workspace.search': 'Aktive Datensätze durchsuchen…', 'workspace.searchLabel': 'Aktive CRM-Datensätze durchsuchen', 'workspace.noMatches': 'Keine passenden Datensätze', 'workspace.loaded': 'Arbeitsbereich geladen · {when}', 'workspace.system': 'FREE CRM BETRIEBSSYSTEM',
  'workspace.demoTitle': 'Demo-Arbeitsbereich', 'workspace.demoBody': 'eine vollständige Geschichte vom Lead bis zur Zahlung ist geladen, damit jedes Modul nützlich ist.', 'workspace.startClean': 'Neu beginnen',
  'onboarding.eyebrow': 'ARBEITSBEREICH EINRICHTEN', 'onboarding.title': 'Wie wirst du FREE CRM nutzen?', 'onboarding.body': 'Wähle einen ruhigen Ausgangspunkt. Profile ändern nur Standards; deine Daten bleiben immer im selben Arbeitsbereich.', 'onboarding.personal': 'Persönlich / solo', 'onboarding.personalHelp': 'Das Wesentliche für Einzelpersonen', 'onboarding.business': 'Geschäftsprofil', 'onboarding.businessHelp': 'Vertrieb und Service für einen Eigentümer', 'onboarding.enterprise': 'Enterprise-Profil', 'onboarding.enterpriseHelp': 'Höhere Limits; ein Eigentümer, mit Richtlinien für Agenten', 'onboarding.ready': 'Dein Arbeitsbereich ist bereit. Du kannst dieses Profil jederzeit ändern.',
  'dashboard.openPipeline': 'Offene Pipeline', 'dashboard.weighted': '{amount} gewichtet', 'dashboard.revenueWon': 'Gewonnener Umsatz', 'dashboard.closedOpportunities': 'Abgeschlossene Chancen', 'dashboard.outstanding': 'Ausstehend', 'dashboard.overdueAmount': '{amount} überfällig', 'dashboard.needsAttention': 'Benötigt Aufmerksamkeit', 'dashboard.attentionNote': '{tasks} überfällig · {tickets} Tickets', 'dashboard.today': 'HEUTE', 'dashboard.commitments': 'Deine Zusagen', 'dashboard.addTask': 'Aufgabe hinzufügen', 'dashboard.forecast': 'PROGNOSE', 'dashboard.pipelineShape': 'Pipeline-Verteilung', 'dashboard.openBoard': 'Board öffnen →', 'dashboard.signals': 'KUNDENSIGNALE', 'dashboard.recentActivity': 'Letzte Aktivität', 'dashboard.viewAll': 'Alle anzeigen →', 'dashboard.soloFocus': 'SOLO-FOKUS', 'dashboard.calmSystem': 'Ein ruhiges System', 'dashboard.focusBody': 'Aktive CRM-Datensätze und Berichte leben in einem Arbeitsbereich. Konvertierungslinks erscheinen in Customer 360.', 'dashboard.taskCompletion': 'Aufgaben erledigt', 'dashboard.leadConversion': 'Lead-Konvertierung', 'dashboard.exploreInsights': 'Einblicke erkunden',
  'date.never': 'Nie', 'date.today': 'Heute', 'date.yesterday': 'Gestern', 'date.inDays': 'In {count} Tag(en)', 'date.daysAgo': 'Vor {count} Tagen',
  'admin.workspace': 'ARBEITSBEREICH', 'admin.profileDefaults': 'Profil und Standards', 'admin.workspaceName': 'Name des Arbeitsbereichs', 'admin.workStyle': 'Wie arbeitest du?', 'admin.currency': 'Währung', 'admin.save': 'Einstellungen speichern', 'admin.saved': 'Sprache und Profil gespeichert, ohne Daten zu verschieben.',
};

const arabic: Dictionary = {
  'language.label': 'اللغة', 'language.workspaceHelp': 'تُحفظ اللغة لمساحة العمل وتُستخدم للتواريخ والعملات.',
  'landing.skip': 'تخطي المقدمة', 'landing.pause': 'إيقاف الحركة مؤقتًا', 'landing.resume': 'استئناف الحركة', 'landing.about': 'حول FREE CRM', 'landing.navigation': 'التنقل في FREE CRM', 'landing.how': 'كيف يعمل', 'landing.insights': 'الرؤى', 'landing.explore': 'استكشف', 'landing.platform': 'المنصة', 'landing.tour': 'جولة المنتج', 'landing.contribute': 'ساهم', 'landing.workspace': 'مساحة المالك', 'landing.kicker': 'نظام تشغيل للعملاء لشخص واحد', 'landing.findPath': 'اعثر على مساري', 'landing.guidance': 'قليل من الإرشاد. ومسار خاص بك.', 'landing.replay': 'إعادة حركة النسر', 'landing.openSource': 'مفتوح المصدر على GitHub', 'landing.freeForever': 'مجاني للجميع. إلى الأبد.', 'landing.origin': 'صُنع في كاليفورنيا · ملكك في كل مكان', 'landing.customers': 'عملاؤك.', 'landing.craft': 'عملك.', 'landing.data': 'بياناتك.', 'landing.aboutBody': 'مكان خاص واحد للعلاقات والمبيعات والعمل والفوترة والخدمة والمستندات والقرارات. مفتوح المصدر، بلا اشتراك.', 'landing.deploy': 'شغّل نسختك', 'landing.readInsights': 'اقرأ رؤى FREE CRM', 'landing.contributionGuide': 'دليل المساهمة', 'landing.viewGithub': 'عرض على GitHub',
  'common.close': 'إغلاق', 'common.new': '{item} جديد', 'state.opening': 'جارٍ فتح FREE CRM', 'state.loading': 'جارٍ تحميل مساحة عملك الخاصة والتقارير…', 'state.unavailable': 'مساحة العمل غير متاحة', 'state.retry': 'حاول مرة أخرى', 'state.signIn': 'تسجيل الدخول إلى FREE CRM', 'state.continueGithub': 'المتابعة باستخدام GitHub',
  'nav.close': 'إغلاق التنقل', 'nav.open': 'فتح التنقل', 'nav.label': 'التنقل في CRM', 'nav.home': 'الرئيسية', 'nav.relationships': 'العلاقات', 'nav.sales': 'المبيعات', 'nav.work': 'العمل', 'nav.growth': 'النمو', 'nav.service': 'الخدمة', 'nav.operate': 'التشغيل', 'nav.secondBrain': 'العقل الثاني', 'nav.today': 'اليوم', 'nav.reports': 'التقارير', 'nav.workflows': 'سير العمل', 'nav.integrations': 'التكاملات', 'nav.agents': 'الوكلاء', 'nav.settings': 'الإعدادات', 'nav.how': 'كيف يعمل',
  'module.lead': 'العملاء المحتملون', 'module.contact': 'جهات الاتصال', 'module.company': 'الشركات', 'module.opportunity': 'الفرص', 'module.activity': 'الأنشطة', 'module.task': 'المهام', 'module.campaign': 'الحملات', 'module.product': 'المنتجات', 'module.quote': 'عروض الأسعار', 'module.invoice': 'الفواتير', 'module.ticket': 'التذاكر', 'module.document': 'المستندات', 'module.manage': 'إدارة {items} والحالات والسياق المحفوظ في مساحة العمل.',
  'view.dashboard.title': 'العمل الجيد يبدأ هنا', 'view.dashboard.subtitle': 'علاقاتك وإيراداتك ووعودك في مكان واحد.', 'view.reports.title': 'التقارير والتحليلات', 'view.reports.subtitle': 'إجابات مباشرة من السجلات نفسها التي تدعم يومك.', 'view.workflows.title': 'سير العمل', 'view.workflows.subtitle': 'أتمتة صغيرة وموثوقة مع سجل التشغيل الحديث.', 'view.integrations.title': 'التطبيقات والتكاملات', 'view.integrations.subtitle': 'اتصل بقصد. لا يظهر شيء كمتصل حتى يكون متصلًا فعلًا.', 'view.agents.title': 'البشر + الوكلاء', 'view.agents.subtitle': 'مساعدة مقيدة بالموافقات والميزانيات والإيصالات وإيقاف الطوارئ.', 'view.admin.title': 'الإعدادات والنظام', 'view.admin.subtitle': 'عناصر التحكم وسجل التدقيق والتصدير وصحة المنصة.',
  'workspace.search': 'ابحث في السجلات النشطة…', 'workspace.searchLabel': 'البحث في سجلات CRM النشطة', 'workspace.noMatches': 'لا توجد سجلات مطابقة', 'workspace.loaded': 'تم تحميل مساحة العمل · {when}', 'workspace.system': 'نظام تشغيل FREE CRM',
  'workspace.demoTitle': 'مساحة تجريبية', 'workspace.demoBody': 'تم تحميل رحلة كاملة من العميل المحتمل إلى الدفع لتكون كل الوحدات مفيدة.', 'workspace.startClean': 'البدء من جديد',
  'onboarding.eyebrow': 'إعداد مساحة العمل', 'onboarding.title': 'كيف ستستخدم FREE CRM؟', 'onboarding.body': 'اختر نقطة بداية هادئة. تغيّر الملفات الإعدادات الافتراضية فقط، وتبقى بياناتك دائمًا في مساحة العمل نفسها.', 'onboarding.personal': 'شخصي / فردي', 'onboarding.personalHelp': 'الأساسيات للأفراد وأصحاب العمل المستقل', 'onboarding.business': 'ملف الأعمال', 'onboarding.businessHelp': 'إعدادات المبيعات والخدمة لمالك واحد', 'onboarding.enterprise': 'ملف المؤسسة', 'onboarding.enterpriseHelp': 'حدود أعلى؛ مالك واحد مع ضوابط لسياسات الوكلاء', 'onboarding.ready': 'مساحة عملك جاهزة. يمكنك تغيير هذا الملف في أي وقت.',
  'dashboard.openPipeline': 'مسار المبيعات المفتوح', 'dashboard.weighted': '{amount} مرجّح', 'dashboard.revenueWon': 'الإيرادات المحققة', 'dashboard.closedOpportunities': 'الفرص المغلقة', 'dashboard.outstanding': 'المستحق', 'dashboard.overdueAmount': '{amount} متأخر', 'dashboard.needsAttention': 'يحتاج إلى اهتمام', 'dashboard.attentionNote': '{tasks} متأخرة · {tickets} تذاكر', 'dashboard.today': 'اليوم', 'dashboard.commitments': 'التزاماتك', 'dashboard.addTask': 'إضافة مهمة', 'dashboard.forecast': 'التوقعات', 'dashboard.pipelineShape': 'شكل مسار المبيعات', 'dashboard.openBoard': 'فتح اللوحة ←', 'dashboard.signals': 'إشارات العملاء', 'dashboard.recentActivity': 'النشاط الأخير', 'dashboard.viewAll': 'عرض الكل ←', 'dashboard.soloFocus': 'تركيز فردي', 'dashboard.calmSystem': 'نظام هادئ واحد', 'dashboard.focusBody': 'تعيش سجلات CRM النشطة والتقارير في مساحة عمل واحدة. تظهر روابط التحويل في Customer 360.', 'dashboard.taskCompletion': 'اكتمال المهام', 'dashboard.leadConversion': 'تحويل العملاء المحتملين', 'dashboard.exploreInsights': 'استكشف الرؤى',
  'date.never': 'أبدًا', 'date.today': 'اليوم', 'date.yesterday': 'أمس', 'date.inDays': 'خلال {count} يوم', 'date.daysAgo': 'منذ {count} يوم',
  'admin.workspace': 'مساحة العمل', 'admin.profileDefaults': 'الملف والإعدادات الافتراضية', 'admin.workspaceName': 'اسم مساحة العمل', 'admin.workStyle': 'كيف تعمل؟', 'admin.currency': 'العملة', 'admin.save': 'حفظ الإعدادات', 'admin.saved': 'تم حفظ اللغة والملف دون نقل بياناتك.',
};

const dictionaries: Record<SupportedLocale, Dictionary> = {
  'en-US': english,
  'es-ES': spanish,
  'fr-FR': french,
  'pt-BR': portuguese,
  'de-DE': german,
  'ar-SA': arabic,
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && languageCatalog.some((language) => language.locale === value);
}

export function normalizeLocale(value: unknown, fallback: SupportedLocale = defaultLocale): SupportedLocale {
  if (isSupportedLocale(value)) return value;
  if (typeof value !== 'string') return fallback;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return languageCatalog.find((language) => language.locale.toLowerCase().startsWith(`${base}-`))?.locale ?? fallback;
}

export function localeDirection(locale: unknown): TextDirection {
  const normalized = normalizeLocale(locale);
  return languageCatalog.find((language) => language.locale === normalized)?.direction ?? 'ltr';
}

export function translate(locale: unknown, key: TranslationKey, variables: Record<string, string | number> = {}): string {
  const normalized = normalizeLocale(locale);
  const template = dictionaries[normalized][key] ?? english[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(variables, name) ? String(variables[name]) : match);
}

export function languageName(locale: unknown): string {
  const normalized = normalizeLocale(locale);
  return languageCatalog.find((language) => language.locale === normalized)?.nativeName ?? 'English';
}
