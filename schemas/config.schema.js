const Joi = require('joi');

/**
 * Custom Joi validator for employee_id field
 * Supports: "", "123", 123, [123, 456], "123,456"
 */
const employeeIdSchema = Joi.alternatives()
  .try(
    Joi.string().allow('').messages({
      'string.base': 'employee_id must be a string, number, or array',
      'string.empty': 'employee_id can be empty string (for all employees)'
    }),
    Joi.string().pattern(/^\d+$/).messages({
      'string.pattern.base': 'employee_id as string must be a number or comma-separated numbers (e.g., "123" or "123,456")'
    }),
    Joi.string().pattern(/^\d+(,\s*\d+)*$/).messages({
      'string.pattern.base': 'employee_id as CSV must be comma-separated numbers (e.g., "123,456,789")'
    }),
    Joi.number().positive().messages({
      'number.positive': 'employee_id as number must be positive',
      'number.base': 'employee_id must be a positive number'
    }),
    Joi.array().items(Joi.number().positive()).min(1).messages({
      'array.base': 'employee_id as array must contain numbers',
      'array.min': 'employee_id array must contain at least one ID (use "" for all employees)',
      'number.positive': 'All employee IDs in array must be positive numbers'
    })
  )
  .messages({
    'alternatives.match': 'employee_id must be one of: empty string "" (all employees), single ID "123" or 123, array [123, 456], or CSV "123,456"'
  });

/**
 * Date string validator (YYYY-MM-DD format)
 */
const dateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .messages({
    'string.pattern.base': 'Date must be in YYYY-MM-DD format (e.g., "2025-01-31")',
    'string.empty': 'Date is required and cannot be empty',
    'any.required': 'Date is required'
  });

/**
 * Google Drive folder ID validator
 */
const folderIdSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9_-]{20,50}$/)
  .messages({
    'string.pattern.base': 'Folder ID must be 20-50 characters of letters, numbers, hyphens, and underscores (e.g., "1BY06tq2GJ17mRr6-gTbRHscrdtWWmC_9")',
    'string.empty': 'Folder ID cannot be empty'
  });

/**
 * Complete configuration schema
 */
const configSchema = Joi.object({
  // Output filename templates
  outputFilenames: Joi.object({
    weekly: Joi.string().optional().messages({ 'string.base': 'outputFilenames.weekly must be a string' }),
    team: Joi.string().optional().messages({ 'string.base': 'outputFilenames.team must be a string' }),
    oneOnOne: Joi.string().optional().messages({ 'string.base': 'outputFilenames.oneOnOne must be a string' }),
    dashboard: Joi.string().optional().messages({ 'string.base': 'outputFilenames.dashboard must be a string' })
  })
    .optional()
    .messages({ 'object.base': 'outputFilenames must be an object' }),
  // Daily Reports Configuration
  dailyReports: Joi.object({
    query: Joi.object({
      client_project_id: Joi.number()
        .integer()
        .positive()
        .required()
        .messages({
          'number.base': 'client_project_id must be a number',
          'number.positive': 'client_project_id must be a positive number',
          'number.integer': 'client_project_id must be an integer',
          'any.required': 'dailyReports.query.client_project_id is required\n  Example: "client_project_id": 32'
        }),
      
      employee_id: employeeIdSchema.required().messages({
        'any.required': 'dailyReports.query.employee_id is required\n  Examples:\n    - All employees: "employee_id": ""\n    - Single: "employee_id": 123\n    - Multiple: "employee_id": [123, 456, 789]'
      }),
      
      report_date_start: dateSchema.required().messages({
        'any.required': 'dailyReports.query.report_date_start is required\n  Example: "report_date_start": "2025-01-01"'
      }),
      
      report_date_end: dateSchema.required().messages({
        'any.required': 'dailyReports.query.report_date_end is required\n  Example: "report_date_end": "2025-01-31"'
      }),

      // Optional: one-off overrides allowing specific employees to pull reports from
      // different client_project_ids in addition to the base client_project_id.
      // Format:
      //   "employeeProjectOverrides": [
      //     { "employee_id": 12345, "client_project_ids": [999, 1001] }
      //   ]
      employeeProjectOverrides: Joi.array()
        .items(
          Joi.object({
            employee_id: Joi.number().integer().positive().required().messages({
              'number.base': 'employeeProjectOverrides.employee_id must be a number',
              'number.integer': 'employeeProjectOverrides.employee_id must be an integer',
              'number.positive': 'employeeProjectOverrides.employee_id must be a positive number',
              'any.required': 'employeeProjectOverrides.employee_id is required'
            }),
            client_project_ids: Joi.alternatives()
              .try(
                Joi.array().items(Joi.number().integer().positive()).min(1).messages({
                  'array.base': 'client_project_ids must be an array of numbers',
                  'array.min': 'client_project_ids must contain at least one project id'
                }),
                Joi.number().integer().positive()
              )
              .required()
              .messages({
                'any.required': 'client_project_ids is required for employeeProjectOverrides'
              })
          })
        )
        .optional()
        .messages({
          'array.base': 'employeeProjectOverrides must be an array of override objects'
        })
    })
      .required()
      .custom((value, helpers) => {
        // Validate date range
        const start = new Date(value.report_date_start);
        const end = new Date(value.report_date_end);
        if (start > end) {
          return helpers.error('any.invalid', {
            message: `report_date_start (${value.report_date_start}) must be before or equal to report_date_end (${value.report_date_end})`
          });
        }
        return value;
      })
      .messages({
        'any.required': 'dailyReports.query is required - must contain client_project_id, employee_id, report_date_start, and report_date_end'
      })
  })
    .optional()
    .messages({
      'object.base': 'dailyReports must be an object'
    }),

  // Jira Configuration
  jira: Joi.object({
    host: Joi.string()
      .pattern(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)
      .optional()
      .messages({
        'string.pattern.base': 'Jira host must be a valid domain (e.g., "yourcompany.atlassian.net") without protocol',
        'string.empty': 'Jira host cannot be empty if provided'
      }),
    
    project: Joi.string()
      .uppercase()
      .required()
      .messages({
        'string.base': 'Jira project must be a string (project key)',
        'string.empty': 'Jira project key is required and cannot be empty',
        'any.required': 'jira.project is required (your Jira project key)\n  Example: "project": "ROCKS"'
      }),
    
    start_date: dateSchema.required().messages({
      'any.required': 'jira.start_date is required\n  Example: "start_date": "2025-01-01"'
    }),
    
    end_date: dateSchema.required().messages({
      'any.required': 'jira.end_date is required\n  Example: "end_date": "2025-01-31"'
    }),
    
    team_members: Joi.array()
      .items(Joi.string().min(1))
      .default([])
      .messages({
        'array.base': 'team_members must be an array of strings',
        'string.min': 'Team member names cannot be empty strings',
        'string.base': 'Each team member must be a string (name as it appears in Jira)'
      })
  })
    .optional()
    .custom((value, helpers) => {
      // Validate date range
      if (value.start_date && value.end_date) {
        const start = new Date(value.start_date);
        const end = new Date(value.end_date);
        if (start > end) {
          return helpers.error('any.invalid', {
            message: `start_date (${value.start_date}) must be before or equal to end_date (${value.end_date})`
          });
        }
      }
      return value;
    })
    .messages({
      'object.base': 'jira must be an object'
    }),

  // Slack Configuration
  slack: Joi.object({
    botTokenEnv: Joi.string()
      .optional()
      .messages({
        'string.base': 'slack.botTokenEnv must be a string (environment variable name)',
        'string.empty': 'slack.botTokenEnv is required and cannot be empty'
      }),
    
    channels: Joi.array()
      .items(Joi.string().min(1))
      .min(1)
      .optional()
      .messages({
        'array.base': 'slack.channels must be an array of channel IDs or names',
        'array.min': 'slack.channels must contain at least one channel',
        'string.min': 'Channel IDs/names cannot be empty strings',
        'any.required': 'slack.channels is required\n  Example: "channels": ["eng-team", "C01234567"]'
      }),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(1000)
      .default(15)
      .messages({
        'number.base': 'slack.limit must be a number',
        'number.integer': 'slack.limit must be an integer',
        'number.min': 'slack.limit must be at least 1',
        'number.max': 'slack.limit cannot exceed 1000'
      }),
    
    includeThreads: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'slack.includeThreads must be a boolean (true/false)'
      }),
    
    includeReactions: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'slack.includeReactions must be a boolean (true/false)'
      }),
    
    // Optional: resolve Slack user IDs to names during markdown conversion
    resolveUserNames: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'slack.resolveUserNames must be a boolean (true/false)'
      }),
    
    // Optional: path override for cached user map (JSON id -> name)
    userMapFile: Joi.string()
      .optional()
      .messages({
        'string.base': 'slack.userMapFile must be a string (file path)'
      }),
    
    // Optional: refresh the user map automatically during download
    autoFetchUserMap: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'slack.autoFetchUserMap must be a boolean (true/false)'
      }),
    
    dateFilter: Joi.object({
      start_date: dateSchema.messages({
        'any.required': 'slack.dateFilter.start_date is required when dateFilter is provided\n  Example: "start_date": "2025-10-01"'
      }),
      
      end_date: dateSchema.messages({
        'any.required': 'slack.dateFilter.end_date is required when dateFilter is provided\n  Example: "end_date": "2025-10-07"'
      })
    })
      .optional()
      .custom((value, helpers) => {
        // Validate date range
        if (value && value.start_date && value.end_date) {
          const start = new Date(value.start_date);
          const end = new Date(value.end_date);
          if (start > end) {
            return helpers.error('any.invalid', {
              message: `slack.dateFilter.start_date (${value.start_date}) must be before or equal to end_date (${value.end_date})`
            });
          }
        }
        return value;
      })
      .messages({
        'object.base': 'slack.dateFilter must be an object'
      }),
    
    types: Joi.string()
      .default('public_channel,private_channel')
      .messages({
        'string.base': 'slack.types must be a string (comma-separated channel types)'
      })
    ,
    sanitization: Joi.object({
      enable: Joi.boolean().default(true).messages({ 'boolean.base': 'slack.sanitization.enable must be a boolean' }),
      redactCodeBlocks: Joi.boolean().default(true).messages({ 'boolean.base': 'slack.sanitization.redactCodeBlocks must be a boolean' }),
      redactInlineCode: Joi.boolean().default(true).messages({ 'boolean.base': 'slack.sanitization.redactInlineCode must be a boolean' }),
      maskSecrets: Joi.boolean().default(true).messages({ 'boolean.base': 'slack.sanitization.maskSecrets must be a boolean' }),
      promptDenylist: Joi.array().items(Joi.string()).default([]).messages({ 'array.base': 'slack.sanitization.promptDenylist must be an array of strings' }),
      promptDenylistFile: Joi.string().optional().messages({ 'string.base': 'slack.sanitization.promptDenylistFile must be a string (file path)' })
    })
      .default({ enable: true, redactCodeBlocks: true, redactInlineCode: true, maskSecrets: true, promptDenylist: [] })
      .messages({ 'object.base': 'slack.sanitization must be an object' })
  })
    .optional()
    .messages({
      'object.base': 'slack must be an object'
    }),

  // Transcripts Configuration
  transcripts: Joi.object({
    // Support both old single folderId and new folder_ids array
    folder_ids: Joi.array()
      .items(folderIdSchema)
      .min(1)
      .messages({
        'array.base': 'folder_ids must be an array of Google Drive folder IDs',
        'array.min': 'folder_ids must contain at least one folder ID\n  Example: "folder_ids": ["1BY06tq2GJ17mRr6-gTbRHscrdtWWmC_9"]'
      }),
    
    folderId: Joi.alternatives()
      .try(
        folderIdSchema,
        Joi.array().items(folderIdSchema).min(1)
      )
      .messages({
        'alternatives.match': 'folderId must be a string or array of Google Drive folder IDs',
        'array.min': 'folderId array must contain at least one folder ID'
      }),
    
    serviceAccountKeyFile: Joi.string()
      .required()
      .messages({
        'string.base': 'serviceAccountKeyFile must be a string (file path)',
        'string.empty': 'serviceAccountKeyFile is required and cannot be empty',
        'any.required': 'transcripts.serviceAccountKeyFile is required\n  Example: "serviceAccountKeyFile": "./service-account-key.json"'
      }),
    
    downloadDir: Joi.string()
      .required()
      .messages({
        'string.base': 'downloadDir must be a string (directory path)',
        'string.empty': 'downloadDir is required and cannot be empty',
        'any.required': 'transcripts.downloadDir is required\n  Example: "downloadDir": "./transcripts/downloads"'
      }),
    
    filePrefix: Joi.string()
      .allow('')
      .default('')
      .messages({
        'string.base': 'filePrefix must be a string'
      }),

    // Optional: allow multiple global prefixes
    filePrefixes: Joi.array()
      .items(Joi.string())
      .optional()
      .messages({
        'array.base': 'filePrefixes must be an array of strings'
      }),

    // Optional: per-folder prefix override(s); value can be string or array of strings
    prefixByFolder: Joi.object()
      .pattern(/^[a-zA-Z0-9_-]{20,50}$/, Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string()).min(1)
      ))
      .optional()
      .messages({
        'object.base': 'prefixByFolder must be an object mapping folderId -> prefix(es)'
      }),
    
    sanitizeFilenames: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'sanitizeFilenames must be a boolean (true/false)'
      }),
    
    organizeByFolder: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'organizeByFolder must be a boolean (true/false)'
      }),
    
    dateFilter: Joi.object({
      startDate: dateSchema.messages({
        'any.required': 'dateFilter.startDate is required when dateFilter is provided\n  Example: "startDate": "2025-01-01"'
      }),
      
      endDate: dateSchema.messages({
        'any.required': 'dateFilter.endDate is required when dateFilter is provided\n  Example: "endDate": "2025-01-31"'
      }),
      
      enabled: Joi.boolean()
        .default(false)
        .messages({
          'boolean.base': 'dateFilter.enabled must be a boolean (true/false)'
        })
    })
      .optional()
      .custom((value, helpers) => {
        // Validate date range if enabled
        if (value && value.enabled && value.startDate && value.endDate) {
          const start = new Date(value.startDate);
          const end = new Date(value.endDate);
          if (start > end) {
            return helpers.error('any.invalid', {
              message: `dateFilter.startDate (${value.startDate}) must be before or equal to dateFilter.endDate (${value.endDate})`
            });
          }
        }
        return value;
      })
      .messages({
        'object.base': 'dateFilter must be an object'
      }),
    
    convertToMarkdown: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'convertToMarkdown must be a boolean (true/false)'
      }),
    
    markdownOutputDir: Joi.string()
      .when('convertToMarkdown', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.base': 'markdownOutputDir must be a string (directory path)',
        'string.empty': 'markdownOutputDir is required when convertToMarkdown is true',
        'any.required': 'transcripts.markdownOutputDir is required when convertToMarkdown is true\n  Example: "markdownOutputDir": "./transcripts/markdown-output"'
      }),
    
    // Team member filtering configuration
    teamMembers: Joi.array()
      .items(Joi.string().min(1))
      .optional()
      .messages({
        'array.base': 'teamMembers must be an array of strings',
        'string.min': 'Team member names cannot be empty strings',
        'string.base': 'Each team member must be a string (full name)'
      }),
    
    filterByTeamMembers: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'filterByTeamMembers must be a boolean (true/false)'
      }),
    
    minimumTeamMembersRequired: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.base': 'minimumTeamMembersRequired must be a number',
        'number.integer': 'minimumTeamMembersRequired must be an integer',
        'number.min': 'minimumTeamMembersRequired must be at least 1'
      }),
    
    teamMappingFile: Joi.string()
      .default('team-name-mapping.json')
      .messages({
        'string.base': 'teamMappingFile must be a string (file path)'
      }),
    
    multiProjectFolders: Joi.array()
      .items(folderIdSchema)
      .optional()
      .messages({
        'array.base': 'multiProjectFolders must be an array of Google Drive folder IDs',
        'string.pattern.base': 'Each folder ID in multiProjectFolders must be a valid Google Drive folder ID (20-50 characters)'
      })
  })
    .optional()
    // Require either folder_ids or folderId
    .custom((value, helpers) => {
      if (value && !value.folder_ids && !value.folderId) {
        return helpers.error('any.invalid', {
          message: 'transcripts must have either "folder_ids" (array) or "folderId" (string/array)\n  Example: "folder_ids": ["1BY06tq2GJ17mRr6-gTbRHscrdtWWmC_9"]'
        });
      }
      
      // Validate team member filtering consistency
      if (value && value.filterByTeamMembers === true) {
        if (!value.teamMembers || value.teamMembers.length === 0) {
          return helpers.error('any.invalid', {
            message: 'When filterByTeamMembers is true, teamMembers array must be provided and not empty\n  Example: "teamMembers": ["John Doe", "Jane Smith"]'
          });
        }
        
        // Validate minimumTeamMembersRequired doesn't exceed teamMembers length
        const minRequired = value.minimumTeamMembersRequired || 1;
        if (minRequired > value.teamMembers.length) {
          return helpers.error('any.invalid', {
            message: `minimumTeamMembersRequired (${minRequired}) cannot exceed the number of teamMembers (${value.teamMembers.length})\n  Either reduce minimumTeamMembersRequired or add more team members`
          });
        }
      }
      
      // Validate multiProjectFolders are subset of folder_ids
      if (value && value.multiProjectFolders && value.multiProjectFolders.length > 0) {
        const allFolderIds = value.folder_ids || (value.folderId ? (Array.isArray(value.folderId) ? value.folderId : [value.folderId]) : []);
        
        for (const multiProjFolder of value.multiProjectFolders) {
          if (!allFolderIds.includes(multiProjFolder)) {
            return helpers.error('any.invalid', {
              message: `multiProjectFolders contains folder ID "${multiProjFolder}" which is not in folder_ids or folderId\n  All multiProjectFolders must be present in the main folder list`
            });
          }
        }
      }

      // Validate prefixByFolder keys are subset of folder_ids
      if (value && value.prefixByFolder && typeof value.prefixByFolder === 'object') {
        const allFolderIds = value.folder_ids || (value.folderId ? (Array.isArray(value.folderId) ? value.folderId : [value.folderId]) : []);
        for (const k of Object.keys(value.prefixByFolder)) {
          if (!allFolderIds.includes(k)) {
            return helpers.error('any.invalid', {
              message: `prefixByFolder contains folder ID "${k}" which is not in folder_ids or folderId\n  All prefixByFolder keys must be present in the main folder list`
            });
          }
        }
      }
      
      return value;
    })
    .messages({
      'object.base': 'transcripts must be an object'
    })
})
  .min(1)
  .messages({
    'object.min': 'Configuration must contain at least one section (dailyReports, jira, or transcripts)',
    'object.base': 'Configuration must be an object'
  });

module.exports = {
  configSchema,
  employeeIdSchema,
  dateSchema,
  folderIdSchema
};
