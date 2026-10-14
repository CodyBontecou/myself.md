# Claude tool-test ledger

October 14, 2026. All 43 live tools were invoked through the **official MCP Inspector CLI**, in 47 recorded calls, using the isolated reviewer identity. Four tools also passed the real Claude conversation: get_account_profile, get_account_logins, list_cloud_exports and read_cloud_export. The submitted Pro-account listing records Inspector self-testing; Claude confirmed receipt and In review on October 14.

Coverage includes successful reads and owner handoffs, an expiring unclaimed pairing ticket, an unsaved profile proposal, and expected negative offline, consent, ownership and confirmation cases. Expected refusals establish their guards, not successful native effects. Native/OS capture, Debug-only feedback delivery, permanent account/export deletion, actual device disconnect and external support delivery were **not** positively tested live. Local integration fixtures exercise synthetic phone effects and simulated Discord. An isolated online phone and separately authorized disposable targets are required for those positive cases.

All 12 fictional exports and the persistent reviewer identity remain intact; 8 exports are shared. Support sending remained disabled. Neither personal Google account was used as the reviewer. Private raw evidence is in ignored .local/claude-submission/tool-tests/; credentials, tokens, pairing URLs and record bodies are excluded here.

| Tool                                 | Scenario                                                                | Observed result                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| get_account_logins                   | normal read or owner handoff                                            | returned successfully                                                           |
| list_connected_phones                | normal read or owner handoff                                            | returned successfully                                                           |
| list_cloud_exports                   | Shared inventory before/after tests                                     | 8 shared fixtures retained                                                      |
| get_account_profile                  | Claude-compatible MCP-only scopes                                       | Null profile fields returned within scope                                       |
| get_public_dataset_catalog           | normal read or owner handoff                                            | returned successfully                                                           |
| get_public_documentation             | normal read or owner handoff                                            | returned successfully                                                           |
| get_account_deletion                 | normal read or owner handoff                                            | active                                                                          |
| request_account_deletion             | normal read or owner handoff                                            | active                                                                          |
| get_privacy_policy                   | normal read or owner handoff                                            | returned successfully                                                           |
| get_lifetime_access                  | normal read or owner handoff                                            | returned successfully                                                           |
| get_cloud_storage                    | normal read or owner handoff                                            | returned successfully                                                           |
| list_export_schemas                  | normal read or owner handoff                                            | returned successfully                                                           |
| create_phone_pairing                 | Create unclaimed expiring pairing ticket                                | returned successfully                                                           |
| get_pairing_status                   | Verify newly-created ticket remains unclaimed                           | returned successfully                                                           |
| list_phone_export_history            | normal read or owner handoff                                            | returned successfully                                                           |
| diagnose_phone_export                | Inspect fictional export audit metadata                                 | returned successfully                                                           |
| list_phone_logs                      | Read authorized fictional export history while source is offline        | returned successfully                                                           |
| request_account_link                 | Reviewer social-provider denial                                         | Provider is unavailable.                                                        |
| get_phone_debug_logs                 | Owned offline source: honest unavailable state, no native capture       | offline                                                                         |
| request_phone_debug_access           | Owned offline source: honest unavailable state, no native capture       | offline                                                                         |
| get_phone_feedback                   | Owned offline source: honest unavailable state, no native capture       | returned successfully                                                           |
| get_phone_data_catalog               | Owned offline source: honest unavailable state, no native capture       | returned successfully                                                           |
| request_phone_debug_content          | Owner handoff only; no consent changes                                  | offline                                                                         |
| request_phone_feedback               | Offline source refuses capture dispatch                                 | Open the paired phone app first.                                                |
| request_phone_feedback_settings      | Offline source refuses settings dispatch                                | Open the paired phone app first.                                                |
| request_phone_feedback_notifications | Offline source refuses notification dispatch                            | Open the paired phone app first.                                                |
| get_phone_feedback_operation         | Rejected operation is not fabricated as completed                       | Feedback operation not found.                                                   |
| preview_phone_profile_import         | Offline source refuses live selectable-catalog preview                  | Phone is offline. Open myself.md first.                                         |
| create_phone_export_profile          | Validated unsaved profile proposal                                      | Proposal returned; no phone delivery or grant                                   |
| get_phone_profile_delivery           | Unknown delivery is denied                                              | Profile delivery expired or not found.                                          |
| request_phone_profile_agent_access   | Offline source cannot change agent grant                                | Phone is offline. Open myself.md first.                                         |
| request_phone_profile_permissions    | Offline source cannot change data permissions                           | Phone is offline. Open myself.md first.                                         |
| query_phone_data                     | Offline source refuses native query; no completed-capture claim         | Phone is offline. Open myself.md first.                                         |
| get_phone_request                    | Unknown query is denied                                                 | Request expired or not found.                                                   |
| forget_phone_request                 | Unknown request; no existing request affected                           | Idempotent success                                                              |
| read_cloud_export                    | Two pages of shared fictional health export                             | 50 + 22 records; fictional markers verified                                     |
| delete_cloud_export                  | Unknown export ownership/not-found denial; retained fixtures untouched  | Cloud export not found.                                                         |
| disconnect_phone                     | Unknown device; fixture retained                                        | Idempotent success without a matching device; no real disconnect                |
| get_support_conversation             | Support access disabled                                                 | Owner handoff; agentAccess false; no delivery                                   |
| send_support_message                 | Support consent denial before delivery; no recipient message authorized | Enable agent access to support in the mobile or dashboard Support screen first. |
| revoke_support_agent_access          | Idempotent access revocation while already unapproved                   | returned successfully                                                           |
| support_conversations                | Owner handoff/denial; no conversation creation or send                  | awaiting_user                                                                   |
| delete_account                       | Invalid destructive confirmation                                        | Rejected before deletion; reviewer remains active                               |
