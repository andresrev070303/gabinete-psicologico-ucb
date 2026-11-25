import { relations } from "drizzle-orm/relations";
import { accountInIam, authSessionInIam, personInCore, roleInIam, permissionInIam, rolePermissionInIam, accountRoleInIam, institutionInCore, intakeRequestInCare, consultationReasonInCare, caseStateInCare, allowedStateTransitionInCare, caseFileInCare, serviceTypeInCare, caseParticipantInCare, caseAssignmentInCare, caseReferralInCare, consentRecordInCare, appointmentInAgenda, sessionRecordInCare, caseStateHistoryInCare, sessionStatusHistoryInCare, roomInAgenda, evaluationProcessInEvaluation, instrumentApplicationInEvaluation, instrumentInEvaluation, placementInPracticum, academicTermInPracticum, placementCaseInPracticum, supervisionInPracticum, performanceReviewInPracticum, activityLogInPracticum, agreementInProjects, projectInProjects, projectInstitutionInProjects, activityInProjects, activityParticipantInProjects, serviceFeedbackInQuality, caseInterruptionInQuality, documentInArchive, documentTypeInArchive, documentLinkInArchive, reportExecutionInReporting, academicProgramInCore, emergencyContactInCore, personAffiliationInCore, appointmentHistoryInAgenda, instrumentLoanInEvaluation, documentVersionInArchive, changeEventInAudit, accessEventInAudit } from "./schema.js";

export const authSessionInIamRelations = relations(authSessionInIam, ({one, many}) => ({
	accountInIam: one(accountInIam, {
		fields: [authSessionInIam.accountId],
		references: [accountInIam.id]
	}),
	changeEventInAudits: many(changeEventInAudit),
	accessEventInAudits: many(accessEventInAudit),
}));

export const accountInIamRelations = relations(accountInIam, ({one, many}) => ({
	authSessionInIam: many(authSessionInIam),
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [accountInIam.createdByAccountId],
		references: [accountInIam.id],
		relationName: "accountInIam_createdByAccountId_accountInIam_id"
	}),
	accountsCreated: many(accountInIam, {
		relationName: "accountInIam_createdByAccountId_accountInIam_id"
	}),
	personInCore: one(personInCore, {
		fields: [accountInIam.personId],
		references: [personInCore.id],
		relationName: "accountInIam_personId_personInCore_id"
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [accountInIam.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "accountInIam_updatedByAccountId_accountInIam_id"
	}),
	accountsUpdated: many(accountInIam, {
		relationName: "accountInIam_updatedByAccountId_accountInIam_id"
	}),
	roleInIam_createdByAccountId: many(roleInIam, {
		relationName: "roleInIam_createdByAccountId_accountInIam_id"
	}),
	roleInIam_updatedByAccountId: many(roleInIam, {
		relationName: "roleInIam_updatedByAccountId_accountInIam_id"
	}),
	permissionInIam_createdByAccountId: many(permissionInIam, {
		relationName: "permissionInIam_createdByAccountId_accountInIam_id"
	}),
	permissionInIam_updatedByAccountId: many(permissionInIam, {
		relationName: "permissionInIam_updatedByAccountId_accountInIam_id"
	}),
	rolePermissionInIam_grantedByAccountId: many(rolePermissionInIam, {
		relationName: "rolePermissionInIam_grantedByAccountId_accountInIam_id"
	}),
	rolePermissionInIam_revokedByAccountId: many(rolePermissionInIam, {
		relationName: "rolePermissionInIam_revokedByAccountId_accountInIam_id"
	}),
	accountRoleInIam_accountId: many(accountRoleInIam, {
		relationName: "accountRoleInIam_accountId_accountInIam_id"
	}),
	accountRoleInIam_grantedByAccountId: many(accountRoleInIam, {
		relationName: "accountRoleInIam_grantedByAccountId_accountInIam_id"
	}),
	accountRoleInIam_revokedByAccountId: many(accountRoleInIam, {
		relationName: "accountRoleInIam_revokedByAccountId_accountInIam_id"
	}),
	intakeRequestInCares_receivedByAccountId: many(intakeRequestInCare, {
		relationName: "intakeRequestInCare_receivedByAccountId_accountInIam_id"
	}),
	intakeRequestInCares_urgencyRecordedByAccountId: many(intakeRequestInCare, {
		relationName: "intakeRequestInCare_urgencyRecordedByAccountId_accountInIam_id"
	}),
	caseFileInCares_createdByAccountId: many(caseFileInCare, {
		relationName: "caseFileInCare_createdByAccountId_accountInIam_id"
	}),
	caseFileInCares_stateChangedByAccountId: many(caseFileInCare, {
		relationName: "caseFileInCare_stateChangedByAccountId_accountInIam_id"
	}),
	caseFileInCares_updatedByAccountId: many(caseFileInCare, {
		relationName: "caseFileInCare_updatedByAccountId_accountInIam_id"
	}),
	caseParticipantInCares: many(caseParticipantInCare),
	caseAssignmentInCares_accountId: many(caseAssignmentInCare, {
		relationName: "caseAssignmentInCare_accountId_accountInIam_id"
	}),
	caseAssignmentInCares_assignedByAccountId: many(caseAssignmentInCare, {
		relationName: "caseAssignmentInCare_assignedByAccountId_accountInIam_id"
	}),
	caseReferralInCares_referredByAccountId: many(caseReferralInCare, {
		relationName: "caseReferralInCare_referredByAccountId_accountInIam_id"
	}),
	caseReferralInCares_referredToAccountId: many(caseReferralInCare, {
		relationName: "caseReferralInCare_referredToAccountId_accountInIam_id"
	}),
	consentRecordInCares: many(consentRecordInCare),
	sessionRecordInCares_professionalAccountId: many(sessionRecordInCare, {
		relationName: "sessionRecordInCare_professionalAccountId_accountInIam_id"
	}),
	sessionRecordInCares_recordedByAccountId: many(sessionRecordInCare, {
		relationName: "sessionRecordInCare_recordedByAccountId_accountInIam_id"
	}),
	sessionRecordInCares_updatedByAccountId: many(sessionRecordInCare, {
		relationName: "sessionRecordInCare_updatedByAccountId_accountInIam_id"
	}),
	sessionRecordInCares_verifiedByAccountId: many(sessionRecordInCare, {
		relationName: "sessionRecordInCare_verifiedByAccountId_accountInIam_id"
	}),
	caseStateHistoryInCares: many(caseStateHistoryInCare),
	sessionStatusHistoryInCares: many(sessionStatusHistoryInCare),
	appointmentInAgenda_bookedByAccountId: many(appointmentInAgenda, {
		relationName: "appointmentInAgenda_bookedByAccountId_accountInIam_id"
	}),
	appointmentInAgenda_professionalAccountId: many(appointmentInAgenda, {
		relationName: "appointmentInAgenda_professionalAccountId_accountInIam_id"
	}),
	appointmentInAgenda_updatedByAccountId: many(appointmentInAgenda, {
		relationName: "appointmentInAgenda_updatedByAccountId_accountInIam_id"
	}),
	evaluationProcessInEvaluations_createdByAccountId: many(evaluationProcessInEvaluation, {
		relationName: "evaluationProcessInEvaluation_createdByAccountId_accountInIam_id"
	}),
	evaluationProcessInEvaluations_responsibleAccountId: many(evaluationProcessInEvaluation, {
		relationName: "evaluationProcessInEvaluation_responsibleAccountId_accountInIam_id"
	}),
	instrumentApplicationInEvaluations: many(instrumentApplicationInEvaluation),
	placementInPracticums: many(placementInPracticum),
	placementCaseInPracticums: many(placementCaseInPracticum),
	supervisionInPracticums: many(supervisionInPracticum),
	performanceReviewInPracticums: many(performanceReviewInPracticum),
	activityLogInPracticums: many(activityLogInPracticum),
	agreementInProjects: many(agreementInProjects),
	projectInProjects: many(projectInProjects),
	serviceFeedbackInQualities: many(serviceFeedbackInQuality),
	caseInterruptionInQualities: many(caseInterruptionInQuality),
	documentInArchives: many(documentInArchive),
	documentLinkInArchives_linkedByAccountId: many(documentLinkInArchive, {
		relationName: "documentLinkInArchive_linkedByAccountId_accountInIam_id"
	}),
	documentLinkInArchives_revokedByAccountId: many(documentLinkInArchive, {
		relationName: "documentLinkInArchive_revokedByAccountId_accountInIam_id"
	}),
	reportExecutionInReportings: many(reportExecutionInReporting),
	personInCores_createdByAccountId: many(personInCore, {
		relationName: "personInCore_createdByAccountId_accountInIam_id"
	}),
	personInCores_updatedByAccountId: many(personInCore, {
		relationName: "personInCore_updatedByAccountId_accountInIam_id"
	}),
	appointmentHistoryInAgenda_changedByAccountId: many(appointmentHistoryInAgenda, {
		relationName: "appointmentHistoryInAgenda_changedByAccountId_accountInIam_id"
	}),
	appointmentHistoryInAgenda_newProfessionalAccountId: many(appointmentHistoryInAgenda, {
		relationName: "appointmentHistoryInAgenda_newProfessionalAccountId_accountInIam_id"
	}),
	appointmentHistoryInAgenda_previousProfessionalAccountId: many(appointmentHistoryInAgenda, {
		relationName: "appointmentHistoryInAgenda_previousProfessionalAccountId_accountInIam_id"
	}),
	instrumentLoanInEvaluations_checkedOutByAccountId: many(instrumentLoanInEvaluation, {
		relationName: "instrumentLoanInEvaluation_checkedOutByAccountId_accountInIam_id"
	}),
	instrumentLoanInEvaluations_createdByAccountId: many(instrumentLoanInEvaluation, {
		relationName: "instrumentLoanInEvaluation_createdByAccountId_accountInIam_id"
	}),
	instrumentLoanInEvaluations_receivedByAccountId: many(instrumentLoanInEvaluation, {
		relationName: "instrumentLoanInEvaluation_receivedByAccountId_accountInIam_id"
	}),
	documentVersionInArchives: many(documentVersionInArchive),
	changeEventInAudits: many(changeEventInAudit),
	accessEventInAudits: many(accessEventInAudit),
}));

export const personInCoreRelations = relations(personInCore, ({one, many}) => ({
	accountInIam_personId: many(accountInIam, {
		relationName: "accountInIam_personId_personInCore_id"
	}),
	intakeRequestInCares: many(intakeRequestInCare),
	caseFileInCares: many(caseFileInCare),
	caseParticipantInCares: many(caseParticipantInCare),
	consentRecordInCares: many(consentRecordInCare),
	placementInPracticums: many(placementInPracticum),
	activityParticipantInProjects: many(activityParticipantInProjects),
	emergencyContactInCores: many(emergencyContactInCore),
	personAffiliationInCores: many(personAffiliationInCore),
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [personInCore.createdByAccountId],
		references: [accountInIam.id],
		relationName: "personInCore_createdByAccountId_accountInIam_id"
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [personInCore.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "personInCore_updatedByAccountId_accountInIam_id"
	}),
	instrumentLoanInEvaluations: many(instrumentLoanInEvaluation),
}));

export const roleInIamRelations = relations(roleInIam, ({one, many}) => ({
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [roleInIam.createdByAccountId],
		references: [accountInIam.id],
		relationName: "roleInIam_createdByAccountId_accountInIam_id"
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [roleInIam.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "roleInIam_updatedByAccountId_accountInIam_id"
	}),
	rolePermissionInIam: many(rolePermissionInIam),
	accountRoleInIam: many(accountRoleInIam),
}));

export const permissionInIamRelations = relations(permissionInIam, ({one, many}) => ({
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [permissionInIam.createdByAccountId],
		references: [accountInIam.id],
		relationName: "permissionInIam_createdByAccountId_accountInIam_id"
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [permissionInIam.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "permissionInIam_updatedByAccountId_accountInIam_id"
	}),
	rolePermissionInIam: many(rolePermissionInIam),
}));

export const rolePermissionInIamRelations = relations(rolePermissionInIam, ({one}) => ({
	accountInIam_grantedByAccountId: one(accountInIam, {
		fields: [rolePermissionInIam.grantedByAccountId],
		references: [accountInIam.id],
		relationName: "rolePermissionInIam_grantedByAccountId_accountInIam_id"
	}),
	permissionInIam: one(permissionInIam, {
		fields: [rolePermissionInIam.permissionId],
		references: [permissionInIam.id]
	}),
	accountInIam_revokedByAccountId: one(accountInIam, {
		fields: [rolePermissionInIam.revokedByAccountId],
		references: [accountInIam.id],
		relationName: "rolePermissionInIam_revokedByAccountId_accountInIam_id"
	}),
	roleInIam: one(roleInIam, {
		fields: [rolePermissionInIam.roleId],
		references: [roleInIam.id]
	}),
}));

export const accountRoleInIamRelations = relations(accountRoleInIam, ({one}) => ({
	accountInIam_accountId: one(accountInIam, {
		fields: [accountRoleInIam.accountId],
		references: [accountInIam.id],
		relationName: "accountRoleInIam_accountId_accountInIam_id"
	}),
	accountInIam_grantedByAccountId: one(accountInIam, {
		fields: [accountRoleInIam.grantedByAccountId],
		references: [accountInIam.id],
		relationName: "accountRoleInIam_grantedByAccountId_accountInIam_id"
	}),
	accountInIam_revokedByAccountId: one(accountInIam, {
		fields: [accountRoleInIam.revokedByAccountId],
		references: [accountInIam.id],
		relationName: "accountRoleInIam_revokedByAccountId_accountInIam_id"
	}),
	roleInIam: one(roleInIam, {
		fields: [accountRoleInIam.roleId],
		references: [roleInIam.id]
	}),
}));

export const intakeRequestInCareRelations = relations(intakeRequestInCare, ({one, many}) => ({
	institutionInCore: one(institutionInCore, {
		fields: [intakeRequestInCare.originatingInstitutionId],
		references: [institutionInCore.id]
	}),
	personInCore: one(personInCore, {
		fields: [intakeRequestInCare.personId],
		references: [personInCore.id]
	}),
	consultationReasonInCare: one(consultationReasonInCare, {
		fields: [intakeRequestInCare.reasonId],
		references: [consultationReasonInCare.id]
	}),
	accountInIam_receivedByAccountId: one(accountInIam, {
		fields: [intakeRequestInCare.receivedByAccountId],
		references: [accountInIam.id],
		relationName: "intakeRequestInCare_receivedByAccountId_accountInIam_id"
	}),
	accountInIam_urgencyRecordedByAccountId: one(accountInIam, {
		fields: [intakeRequestInCare.urgencyRecordedByAccountId],
		references: [accountInIam.id],
		relationName: "intakeRequestInCare_urgencyRecordedByAccountId_accountInIam_id"
	}),
	caseFileInCares_intakeRequestId: many(caseFileInCare, {
		relationName: "caseFileInCare_intakeRequestId_intakeRequestInCare_id"
	}),
	caseFileInCares_personId: many(caseFileInCare, {
		relationName: "caseFileInCare_personId_intakeRequestInCare_id"
	}),
}));

export const institutionInCoreRelations = relations(institutionInCore, ({one, many}) => ({
	intakeRequestInCares: many(intakeRequestInCare),
	caseReferralInCares: many(caseReferralInCare),
	agreementInProjects: many(agreementInProjects),
	projectInstitutionInProjects: many(projectInstitutionInProjects),
	activityInProjects: many(activityInProjects),
	institutionInCore: one(institutionInCore, {
		fields: [institutionInCore.parentInstitutionId],
		references: [institutionInCore.id],
		relationName: "institutionInCore_parentInstitutionId_institutionInCore_id"
	}),
	institutionInCores: many(institutionInCore, {
		relationName: "institutionInCore_parentInstitutionId_institutionInCore_id"
	}),
	academicProgramInCores: many(academicProgramInCore),
	personAffiliationInCores: many(personAffiliationInCore),
}));

export const consultationReasonInCareRelations = relations(consultationReasonInCare, ({many}) => ({
	intakeRequestInCares: many(intakeRequestInCare),
	caseFileInCares: many(caseFileInCare),
}));

export const allowedStateTransitionInCareRelations = relations(allowedStateTransitionInCare, ({one}) => ({
	caseStateInCare_fromStateId: one(caseStateInCare, {
		fields: [allowedStateTransitionInCare.fromStateId],
		references: [caseStateInCare.id],
		relationName: "allowedStateTransitionInCare_fromStateId_caseStateInCare_id"
	}),
	caseStateInCare_toStateId: one(caseStateInCare, {
		fields: [allowedStateTransitionInCare.toStateId],
		references: [caseStateInCare.id],
		relationName: "allowedStateTransitionInCare_toStateId_caseStateInCare_id"
	}),
}));

export const caseStateInCareRelations = relations(caseStateInCare, ({many}) => ({
	allowedStateTransitionInCares_fromStateId: many(allowedStateTransitionInCare, {
		relationName: "allowedStateTransitionInCare_fromStateId_caseStateInCare_id"
	}),
	allowedStateTransitionInCares_toStateId: many(allowedStateTransitionInCare, {
		relationName: "allowedStateTransitionInCare_toStateId_caseStateInCare_id"
	}),
	caseFileInCares: many(caseFileInCare),
	caseStateHistoryInCares_fromStateId: many(caseStateHistoryInCare, {
		relationName: "caseStateHistoryInCare_fromStateId_caseStateInCare_id"
	}),
	caseStateHistoryInCares_toStateId: many(caseStateHistoryInCare, {
		relationName: "caseStateHistoryInCare_toStateId_caseStateInCare_id"
	}),
}));

export const caseFileInCareRelations = relations(caseFileInCare, ({one, many}) => ({
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [caseFileInCare.createdByAccountId],
		references: [accountInIam.id],
		relationName: "caseFileInCare_createdByAccountId_accountInIam_id"
	}),
	caseStateInCare: one(caseStateInCare, {
		fields: [caseFileInCare.currentStateId],
		references: [caseStateInCare.id]
	}),
	intakeRequestInCare_intakeRequestId: one(intakeRequestInCare, {
  		fields: [caseFileInCare.intakeRequestId],
 		references: [intakeRequestInCare.id],
  		relationName: "caseFileInCare_intakeRequestId_intakeRequestInCare_id",
	}),
	personInCore: one(personInCore, {
		fields: [caseFileInCare.personId],
		references: [personInCore.id]
	}),
	consultationReasonInCare: one(consultationReasonInCare, {
		fields: [caseFileInCare.primaryReasonId],
		references: [consultationReasonInCare.id]
	}),
	serviceTypeInCare: one(serviceTypeInCare, {
		fields: [caseFileInCare.serviceTypeId],
		references: [serviceTypeInCare.id]
	}),
	accountInIam_stateChangedByAccountId: one(accountInIam, {
		fields: [caseFileInCare.stateChangedByAccountId],
		references: [accountInIam.id],
		relationName: "caseFileInCare_stateChangedByAccountId_accountInIam_id"
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [caseFileInCare.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "caseFileInCare_updatedByAccountId_accountInIam_id"
	}),
	intakeRequestInCare_personId: one(intakeRequestInCare, {
  		fields: [caseFileInCare.intakeRequestId, caseFileInCare.personId],
  		references: [intakeRequestInCare.id, intakeRequestInCare.personId],
  		relationName: "caseFileInCare_personId_intakeRequestInCare_id",
	}),
	caseParticipantInCares: many(caseParticipantInCare),
	caseAssignmentInCares: many(caseAssignmentInCare),
	caseReferralInCares: many(caseReferralInCare),
	consentRecordInCares: many(consentRecordInCare),
	sessionRecordInCares: many(sessionRecordInCare),
	caseStateHistoryInCares: many(caseStateHistoryInCare),
	appointmentInAgenda: many(appointmentInAgenda),
	evaluationProcessInEvaluations: many(evaluationProcessInEvaluation),
	placementCaseInPracticums: many(placementCaseInPracticum),
	activityLogInPracticums: many(activityLogInPracticum),
	serviceFeedbackInQualities: many(serviceFeedbackInQuality),
	caseInterruptionInQualities: many(caseInterruptionInQuality),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const serviceTypeInCareRelations = relations(serviceTypeInCare, ({many}) => ({
	caseFileInCares: many(caseFileInCare),
}));

export const caseParticipantInCareRelations = relations(caseParticipantInCare, ({one}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [caseParticipantInCare.caseId],
		references: [caseFileInCare.id]
	}),
	personInCore: one(personInCore, {
		fields: [caseParticipantInCare.personId],
		references: [personInCore.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [caseParticipantInCare.registeredByAccountId],
		references: [accountInIam.id]
	}),
}));

export const caseAssignmentInCareRelations = relations(caseAssignmentInCare, ({one}) => ({
	accountInIam_accountId: one(accountInIam, {
		fields: [caseAssignmentInCare.accountId],
		references: [accountInIam.id],
		relationName: "caseAssignmentInCare_accountId_accountInIam_id"
	}),
	accountInIam_assignedByAccountId: one(accountInIam, {
		fields: [caseAssignmentInCare.assignedByAccountId],
		references: [accountInIam.id],
		relationName: "caseAssignmentInCare_assignedByAccountId_accountInIam_id"
	}),
	caseFileInCare: one(caseFileInCare, {
		fields: [caseAssignmentInCare.caseId],
		references: [caseFileInCare.id]
	}),
}));

export const caseReferralInCareRelations = relations(caseReferralInCare, ({one}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [caseReferralInCare.caseId],
		references: [caseFileInCare.id]
	}),
	institutionInCore: one(institutionInCore, {
		fields: [caseReferralInCare.destinationInstitutionId],
		references: [institutionInCore.id]
	}),
	accountInIam_referredByAccountId: one(accountInIam, {
		fields: [caseReferralInCare.referredByAccountId],
		references: [accountInIam.id],
		relationName: "caseReferralInCare_referredByAccountId_accountInIam_id"
	}),
	accountInIam_referredToAccountId: one(accountInIam, {
		fields: [caseReferralInCare.referredToAccountId],
		references: [accountInIam.id],
		relationName: "caseReferralInCare_referredToAccountId_accountInIam_id"
	}),
}));

export const consentRecordInCareRelations = relations(consentRecordInCare, ({one, many}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [consentRecordInCare.caseId],
		references: [caseFileInCare.id]
	}),
	personInCore: one(personInCore, {
		fields: [consentRecordInCare.personId],
		references: [personInCore.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [consentRecordInCare.recordedByAccountId],
		references: [accountInIam.id]
	}),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const sessionRecordInCareRelations = relations(sessionRecordInCare, ({one, many}) => ({
	appointmentInAgendum: one(appointmentInAgenda, {
		fields: [sessionRecordInCare.appointmentId, sessionRecordInCare.caseId],
		references: [appointmentInAgenda.id, appointmentInAgenda.caseId],
	}),
	caseFileInCare: one(caseFileInCare, {
		fields: [sessionRecordInCare.caseId],
		references: [caseFileInCare.id]
	}),
	accountInIam_professionalAccountId: one(accountInIam, {
		fields: [sessionRecordInCare.professionalAccountId],
		references: [accountInIam.id],
		relationName: "sessionRecordInCare_professionalAccountId_accountInIam_id"
	}),
	accountInIam_recordedByAccountId: one(accountInIam, {
		fields: [sessionRecordInCare.recordedByAccountId],
		references: [accountInIam.id],
		relationName: "sessionRecordInCare_recordedByAccountId_accountInIam_id"
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [sessionRecordInCare.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "sessionRecordInCare_updatedByAccountId_accountInIam_id"
	}),
	accountInIam_verifiedByAccountId: one(accountInIam, {
		fields: [sessionRecordInCare.verifiedByAccountId],
		references: [accountInIam.id],
		relationName: "sessionRecordInCare_verifiedByAccountId_accountInIam_id"
	}),
	sessionStatusHistoryInCares: many(sessionStatusHistoryInCare),
	serviceFeedbackInQualities: many(serviceFeedbackInQuality),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const appointmentInAgendaRelations = relations(appointmentInAgenda, ({one, many}) => ({
	sessionRecordInCares: many(sessionRecordInCare),
	accountInIam_bookedByAccountId: one(accountInIam, {
		fields: [appointmentInAgenda.bookedByAccountId],
		references: [accountInIam.id],
		relationName: "appointmentInAgenda_bookedByAccountId_accountInIam_id"
	}),
	caseFileInCare: one(caseFileInCare, {
		fields: [appointmentInAgenda.caseId],
		references: [caseFileInCare.id]
	}),
	accountInIam_professionalAccountId: one(accountInIam, {
		fields: [appointmentInAgenda.professionalAccountId],
		references: [accountInIam.id],
		relationName: "appointmentInAgenda_professionalAccountId_accountInIam_id"
	}),
	roomInAgendum: one(roomInAgenda, {
		fields: [appointmentInAgenda.roomId],
		references: [roomInAgenda.id]
	}),
	accountInIam_updatedByAccountId: one(accountInIam, {
		fields: [appointmentInAgenda.updatedByAccountId],
		references: [accountInIam.id],
		relationName: "appointmentInAgenda_updatedByAccountId_accountInIam_id"
	}),
	appointmentHistoryInAgenda: many(appointmentHistoryInAgenda),
}));

export const caseStateHistoryInCareRelations = relations(caseStateHistoryInCare, ({one}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [caseStateHistoryInCare.caseId],
		references: [caseFileInCare.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [caseStateHistoryInCare.changedByAccountId],
		references: [accountInIam.id]
	}),
	caseStateInCare_fromStateId: one(caseStateInCare, {
		fields: [caseStateHistoryInCare.fromStateId],
		references: [caseStateInCare.id],
		relationName: "caseStateHistoryInCare_fromStateId_caseStateInCare_id"
	}),
	caseStateInCare_toStateId: one(caseStateInCare, {
		fields: [caseStateHistoryInCare.toStateId],
		references: [caseStateInCare.id],
		relationName: "caseStateHistoryInCare_toStateId_caseStateInCare_id"
	}),
}));

export const sessionStatusHistoryInCareRelations = relations(sessionStatusHistoryInCare, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [sessionStatusHistoryInCare.changedByAccountId],
		references: [accountInIam.id]
	}),
	sessionRecordInCare: one(sessionRecordInCare, {
		fields: [sessionStatusHistoryInCare.sessionId],
		references: [sessionRecordInCare.id]
	}),
}));

export const roomInAgendaRelations = relations(roomInAgenda, ({many}) => ({
	appointmentInAgenda: many(appointmentInAgenda),
	appointmentHistoryInAgenda_newRoomId: many(appointmentHistoryInAgenda, {
		relationName: "appointmentHistoryInAgenda_newRoomId_roomInAgenda_id"
	}),
	appointmentHistoryInAgenda_previousRoomId: many(appointmentHistoryInAgenda, {
		relationName: "appointmentHistoryInAgenda_previousRoomId_roomInAgenda_id"
	}),
}));

export const evaluationProcessInEvaluationRelations = relations(evaluationProcessInEvaluation, ({one, many}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [evaluationProcessInEvaluation.caseId],
		references: [caseFileInCare.id]
	}),
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [evaluationProcessInEvaluation.createdByAccountId],
		references: [accountInIam.id],
		relationName: "evaluationProcessInEvaluation_createdByAccountId_accountInIam_id"
	}),
	accountInIam_responsibleAccountId: one(accountInIam, {
		fields: [evaluationProcessInEvaluation.responsibleAccountId],
		references: [accountInIam.id],
		relationName: "evaluationProcessInEvaluation_responsibleAccountId_accountInIam_id"
	}),
	instrumentApplicationInEvaluations: many(instrumentApplicationInEvaluation),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const instrumentApplicationInEvaluationRelations = relations(instrumentApplicationInEvaluation, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [instrumentApplicationInEvaluation.appliedByAccountId],
		references: [accountInIam.id]
	}),
	evaluationProcessInEvaluation: one(evaluationProcessInEvaluation, {
		fields: [instrumentApplicationInEvaluation.evaluationId],
		references: [evaluationProcessInEvaluation.id]
	}),
	instrumentInEvaluation: one(instrumentInEvaluation, {
		fields: [instrumentApplicationInEvaluation.instrumentId],
		references: [instrumentInEvaluation.id]
	}),
}));

export const instrumentInEvaluationRelations = relations(instrumentInEvaluation, ({many}) => ({
	instrumentApplicationInEvaluations: many(instrumentApplicationInEvaluation),
	instrumentLoanInEvaluations: many(instrumentLoanInEvaluation),
}));

export const placementInPracticumRelations = relations(placementInPracticum, ({one, many}) => ({
	personInCore: one(personInCore, {
		fields: [placementInPracticum.studentPersonId],
		references: [personInCore.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [placementInPracticum.supervisorAccountId],
		references: [accountInIam.id]
	}),
	academicTermInPracticum: one(academicTermInPracticum, {
		fields: [placementInPracticum.termId],
		references: [academicTermInPracticum.id]
	}),
	placementCaseInPracticums: many(placementCaseInPracticum),
	supervisionInPracticums: many(supervisionInPracticum),
	performanceReviewInPracticums: many(performanceReviewInPracticum),
	activityLogInPracticums: many(activityLogInPracticum),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const academicTermInPracticumRelations = relations(academicTermInPracticum, ({many}) => ({
	placementInPracticums: many(placementInPracticum),
}));

export const placementCaseInPracticumRelations = relations(placementCaseInPracticum, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [placementCaseInPracticum.assignedByAccountId],
		references: [accountInIam.id]
	}),
	caseFileInCare: one(caseFileInCare, {
		fields: [placementCaseInPracticum.caseId],
		references: [caseFileInCare.id]
	}),
	placementInPracticum: one(placementInPracticum, {
		fields: [placementCaseInPracticum.placementId],
		references: [placementInPracticum.id]
	}),
}));

export const supervisionInPracticumRelations = relations(supervisionInPracticum, ({one}) => ({
	placementInPracticum: one(placementInPracticum, {
		fields: [supervisionInPracticum.placementId],
		references: [placementInPracticum.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [supervisionInPracticum.supervisorAccountId],
		references: [accountInIam.id]
	}),
}));

export const performanceReviewInPracticumRelations = relations(performanceReviewInPracticum, ({one}) => ({
	placementInPracticum: one(placementInPracticum, {
		fields: [performanceReviewInPracticum.placementId],
		references: [placementInPracticum.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [performanceReviewInPracticum.reviewerAccountId],
		references: [accountInIam.id]
	}),
}));

export const activityLogInPracticumRelations = relations(activityLogInPracticum, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [activityLogInPracticum.approvedByAccountId],
		references: [accountInIam.id]
	}),
	caseFileInCare: one(caseFileInCare, {
		fields: [activityLogInPracticum.caseId],
		references: [caseFileInCare.id]
	}),
	placementInPracticum: one(placementInPracticum, {
		fields: [activityLogInPracticum.placementId],
		references: [placementInPracticum.id]
	}),
}));

export const agreementInProjectsRelations = relations(agreementInProjects, ({one, many}) => ({
	institutionInCore: one(institutionInCore, {
		fields: [agreementInProjects.institutionId],
		references: [institutionInCore.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [agreementInProjects.responsibleAccountId],
		references: [accountInIam.id]
	}),
	activityInProjects: many(activityInProjects),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const projectInProjectsRelations = relations(projectInProjects, ({one, many}) => ({
	accountInIam: one(accountInIam, {
		fields: [projectInProjects.responsibleAccountId],
		references: [accountInIam.id]
	}),
	projectInstitutionInProjects: many(projectInstitutionInProjects),
	activityInProjects: many(activityInProjects),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const projectInstitutionInProjectsRelations = relations(projectInstitutionInProjects, ({one}) => ({
	institutionInCore: one(institutionInCore, {
		fields: [projectInstitutionInProjects.institutionId],
		references: [institutionInCore.id]
	}),
	projectInProject: one(projectInProjects, {
		fields: [projectInstitutionInProjects.projectId],
		references: [projectInProjects.id]
	}),
}));

export const activityInProjectsRelations = relations(activityInProjects, ({one, many}) => ({
	agreementInProject: one(agreementInProjects, {
		fields: [activityInProjects.agreementId],
		references: [agreementInProjects.id]
	}),
	institutionInCore: one(institutionInCore, {
		fields: [activityInProjects.institutionId],
		references: [institutionInCore.id]
	}),
	projectInProject: one(projectInProjects, {
		fields: [activityInProjects.projectId],
		references: [projectInProjects.id]
	}),
	activityParticipantInProjects: many(activityParticipantInProjects),
	documentLinkInArchives: many(documentLinkInArchive),
}));

export const activityParticipantInProjectsRelations = relations(activityParticipantInProjects, ({one}) => ({
	activityInProject: one(activityInProjects, {
		fields: [activityParticipantInProjects.activityId],
		references: [activityInProjects.id]
	}),
	personInCore: one(personInCore, {
		fields: [activityParticipantInProjects.personId],
		references: [personInCore.id]
	}),
}));

export const serviceFeedbackInQualityRelations = relations(serviceFeedbackInQuality, ({one}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [serviceFeedbackInQuality.caseId],
		references: [caseFileInCare.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [serviceFeedbackInQuality.enteredByAccountId],
		references: [accountInIam.id]
	}),
	sessionRecordInCare: one(sessionRecordInCare, {
		fields: [serviceFeedbackInQuality.sessionId, serviceFeedbackInQuality.caseId],
		references: [sessionRecordInCare.id, sessionRecordInCare.caseId],
	}),
}));

export const caseInterruptionInQualityRelations = relations(caseInterruptionInQuality, ({one}) => ({
	caseFileInCare: one(caseFileInCare, {
		fields: [caseInterruptionInQuality.caseId],
		references: [caseFileInCare.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [caseInterruptionInQuality.recordedByAccountId],
		references: [accountInIam.id]
	}),
}));

export const documentInArchiveRelations = relations(documentInArchive, ({one, many}) => ({
	accountInIam: one(accountInIam, {
		fields: [documentInArchive.createdByAccountId],
		references: [accountInIam.id]
	}),
	documentTypeInArchive: one(documentTypeInArchive, {
		fields: [documentInArchive.documentTypeId],
		references: [documentTypeInArchive.id]
	}),
	documentLinkInArchives: many(documentLinkInArchive),
	documentVersionInArchives: many(documentVersionInArchive),
}));

export const documentTypeInArchiveRelations = relations(documentTypeInArchive, ({many}) => ({
	documentInArchives: many(documentInArchive),
}));

export const documentLinkInArchiveRelations = relations(documentLinkInArchive, ({one}) => ({
	agreementInProject: one(agreementInProjects, {
		fields: [documentLinkInArchive.agreementId],
		references: [agreementInProjects.id]
	}),
	caseFileInCare: one(caseFileInCare, {
		fields: [documentLinkInArchive.caseId],
		references: [caseFileInCare.id]
	}),
	consentRecordInCare: one(consentRecordInCare, {
		fields: [documentLinkInArchive.consentId],
		references: [consentRecordInCare.id]
	}),
	documentInArchive: one(documentInArchive, {
		fields: [documentLinkInArchive.documentId],
		references: [documentInArchive.id]
	}),
	evaluationProcessInEvaluation: one(evaluationProcessInEvaluation, {
		fields: [documentLinkInArchive.evaluationId],
		references: [evaluationProcessInEvaluation.id]
	}),
	accountInIam_linkedByAccountId: one(accountInIam, {
		fields: [documentLinkInArchive.linkedByAccountId],
		references: [accountInIam.id],
		relationName: "documentLinkInArchive_linkedByAccountId_accountInIam_id"
	}),
	placementInPracticum: one(placementInPracticum, {
		fields: [documentLinkInArchive.placementId],
		references: [placementInPracticum.id]
	}),
	activityInProject: one(activityInProjects, {
		fields: [documentLinkInArchive.projectActivityId],
		references: [activityInProjects.id]
	}),
	projectInProject: one(projectInProjects, {
		fields: [documentLinkInArchive.projectId],
		references: [projectInProjects.id]
	}),
	accountInIam_revokedByAccountId: one(accountInIam, {
		fields: [documentLinkInArchive.revokedByAccountId],
		references: [accountInIam.id],
		relationName: "documentLinkInArchive_revokedByAccountId_accountInIam_id"
	}),
	sessionRecordInCare: one(sessionRecordInCare, {
		fields: [documentLinkInArchive.sessionId],
		references: [sessionRecordInCare.id]
	}),
}));

export const reportExecutionInReportingRelations = relations(reportExecutionInReporting, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [reportExecutionInReporting.requestedByAccountId],
		references: [accountInIam.id]
	}),
}));

export const academicProgramInCoreRelations = relations(academicProgramInCore, ({one, many}) => ({
	institutionInCore: one(institutionInCore, {
		fields: [academicProgramInCore.institutionId],
		references: [institutionInCore.id]
	}),
	personAffiliationInCores_institutionId: many(personAffiliationInCore, {
		relationName: "personAffiliationInCore_institutionId_academicProgramInCore_id"
	}),
	personAffiliationInCores_academicProgramId: many(personAffiliationInCore, {
		relationName: "personAffiliationInCore_academicProgramId_academicProgramInCore_id"
	}),
}));

export const emergencyContactInCoreRelations = relations(emergencyContactInCore, ({one}) => ({
	personInCore: one(personInCore, {
		fields: [emergencyContactInCore.personId],
		references: [personInCore.id]
	}),
}));

export const personAffiliationInCoreRelations = relations(personAffiliationInCore, ({one}) => ({
	academicProgramInCore_institutionId: one(academicProgramInCore, {
		fields: [personAffiliationInCore.academicProgramId, personAffiliationInCore.institutionId],
		references: [academicProgramInCore.id, academicProgramInCore.institutionId],
		relationName: "personAffiliationInCore_institutionId_academicProgramInCore_id"
	}),
	academicProgramInCore_academicProgramId: one(academicProgramInCore, {
		fields: [personAffiliationInCore.academicProgramId],
		references: [academicProgramInCore.id],
		relationName: "personAffiliationInCore_academicProgramId_academicProgramInCore_id"
	}),
	institutionInCore: one(institutionInCore, {
		fields: [personAffiliationInCore.institutionId],
		references: [institutionInCore.id]
	}),
	personInCore: one(personInCore, {
		fields: [personAffiliationInCore.personId],
		references: [personInCore.id]
	}),
}));

export const appointmentHistoryInAgendaRelations = relations(appointmentHistoryInAgenda, ({one}) => ({
	appointmentInAgendum: one(appointmentInAgenda, {
		fields: [appointmentHistoryInAgenda.appointmentId],
		references: [appointmentInAgenda.id]
	}),
	accountInIam_changedByAccountId: one(accountInIam, {
		fields: [appointmentHistoryInAgenda.changedByAccountId],
		references: [accountInIam.id],
		relationName: "appointmentHistoryInAgenda_changedByAccountId_accountInIam_id"
	}),
	accountInIam_newProfessionalAccountId: one(accountInIam, {
		fields: [appointmentHistoryInAgenda.newProfessionalAccountId],
		references: [accountInIam.id],
		relationName: "appointmentHistoryInAgenda_newProfessionalAccountId_accountInIam_id"
	}),
	roomInAgendum_newRoomId: one(roomInAgenda, {
		fields: [appointmentHistoryInAgenda.newRoomId],
		references: [roomInAgenda.id],
		relationName: "appointmentHistoryInAgenda_newRoomId_roomInAgenda_id"
	}),
	accountInIam_previousProfessionalAccountId: one(accountInIam, {
		fields: [appointmentHistoryInAgenda.previousProfessionalAccountId],
		references: [accountInIam.id],
		relationName: "appointmentHistoryInAgenda_previousProfessionalAccountId_accountInIam_id"
	}),
	roomInAgendum_previousRoomId: one(roomInAgenda, {
		fields: [appointmentHistoryInAgenda.previousRoomId],
		references: [roomInAgenda.id],
		relationName: "appointmentHistoryInAgenda_previousRoomId_roomInAgenda_id"
	}),
}));

export const instrumentLoanInEvaluationRelations = relations(instrumentLoanInEvaluation, ({one}) => ({
	personInCore: one(personInCore, {
		fields: [instrumentLoanInEvaluation.borrowerPersonId],
		references: [personInCore.id]
	}),
	accountInIam_checkedOutByAccountId: one(accountInIam, {
		fields: [instrumentLoanInEvaluation.checkedOutByAccountId],
		references: [accountInIam.id],
		relationName: "instrumentLoanInEvaluation_checkedOutByAccountId_accountInIam_id"
	}),
	accountInIam_createdByAccountId: one(accountInIam, {
		fields: [instrumentLoanInEvaluation.createdByAccountId],
		references: [accountInIam.id],
		relationName: "instrumentLoanInEvaluation_createdByAccountId_accountInIam_id"
	}),
	instrumentInEvaluation: one(instrumentInEvaluation, {
		fields: [instrumentLoanInEvaluation.instrumentId],
		references: [instrumentInEvaluation.id]
	}),
	accountInIam_receivedByAccountId: one(accountInIam, {
		fields: [instrumentLoanInEvaluation.receivedByAccountId],
		references: [accountInIam.id],
		relationName: "instrumentLoanInEvaluation_receivedByAccountId_accountInIam_id"
	}),
}));

export const documentVersionInArchiveRelations = relations(documentVersionInArchive, ({one}) => ({
	documentInArchive: one(documentInArchive, {
		fields: [documentVersionInArchive.documentId],
		references: [documentInArchive.id]
	}),
	accountInIam: one(accountInIam, {
		fields: [documentVersionInArchive.uploadedByAccountId],
		references: [accountInIam.id]
	}),
}));

export const changeEventInAuditRelations = relations(changeEventInAudit, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [changeEventInAudit.actorAccountId],
		references: [accountInIam.id]
	}),
	authSessionInIam: one(authSessionInIam, {
		fields: [changeEventInAudit.authSessionId, changeEventInAudit.actorAccountId],
		references: [authSessionInIam.id, authSessionInIam.accountId],
	}),
}));

export const accessEventInAuditRelations = relations(accessEventInAudit, ({one}) => ({
	accountInIam: one(accountInIam, {
		fields: [accessEventInAudit.actorAccountId],
		references: [accountInIam.id]
	}),
	authSessionInIam: one(authSessionInIam, {
		fields: [accessEventInAudit.authSessionId, accessEventInAudit.actorAccountId],
		references: [authSessionInIam.id, authSessionInIam.accountId],
	}),
}));