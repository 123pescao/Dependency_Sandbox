-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('MANIFEST', 'LOCKFILE', 'DIFF');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('ADDED', 'REMOVED', 'UPDATED');

-- CreateEnum
CREATE TYPE "Ecosystem" AS ENUM ('NPM', 'PYPI', 'CARGO', 'MAVEN');

-- CreateEnum
CREATE TYPE "SbomFormat" AS ENUM ('CycloneDX', 'SPDX');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AttestationType" AS ENUM ('GITHUB_ARTIFACT', 'SIGSTORE', 'NPM_PROVENANCE', 'PYPI_ATTESTATION');

-- CreateEnum
CREATE TYPE "SandboxStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PROCESS_SPAWN', 'FILE_WRITE', 'NETWORK_ACCESS', 'SCRIPT_EXECUTION', 'ENVIRONMENT_ACCESS');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('VULNERABILITY', 'PROVENANCE_MISSING', 'SANDBOX_SUSPICIOUS', 'POLICY_VIOLATION', 'LICENSE_ISSUE');

-- CreateEnum
CREATE TYPE "PolicyResult" AS ENUM ('PASS', 'WARN', 'FAIL', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "githubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "commitSha" TEXT,
    "prNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanTarget" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "type" "TargetType" NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyChange" (
    "id" TEXT NOT NULL,
    "scanTargetId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "previousVersion" TEXT,
    "newVersion" TEXT,
    "changeType" "ChangeType" NOT NULL,
    "ecosystem" "Ecosystem" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DependencyChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ecosystem" "Ecosystem" NOT NULL,
    "description" TEXT,
    "homepage" TEXT,
    "repository" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageVersion" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "integrity" TEXT,
    "tarballUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sbom" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "packageId" TEXT,
    "packageVersionId" TEXT,
    "format" "SbomFormat" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sbom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vulnerability" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "versionId" TEXT,
    "vulnId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "affectedVersions" TEXT,
    "fixedVersions" TEXT,
    "references" JSONB,
    "publishedAt" TIMESTAMP(3),
    "modifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vulnerability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "versionId" TEXT,
    "type" "AttestationType" NOT NULL,
    "issuer" TEXT,
    "subject" TEXT,
    "verified" BOOLEAN NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxRun" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "SandboxStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "SandboxRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxEvent" (
    "id" TEXT NOT NULL,
    "sandboxRunId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL,

    CONSTRAINT "SandboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "type" "FindingType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "packageName" TEXT,
    "version" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sandboxRunId" TEXT,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "regoCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDecision" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "result" "PolicyResult" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExplanation" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "technicalSummary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "remediation" JSONB NOT NULL,
    "alternatives" JSONB,
    "policySuggestions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubId_key" ON "Repository"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "Scan_repositoryId_idx" ON "Scan"("repositoryId");

-- CreateIndex
CREATE INDEX "ScanTarget_scanId_idx" ON "ScanTarget"("scanId");

-- CreateIndex
CREATE INDEX "DependencyChange_scanTargetId_idx" ON "DependencyChange"("scanTargetId");

-- CreateIndex
CREATE INDEX "DependencyChange_packageName_idx" ON "DependencyChange"("packageName");

-- CreateIndex
CREATE UNIQUE INDEX "Package_name_key" ON "Package"("name");

-- CreateIndex
CREATE INDEX "PackageVersion_packageId_idx" ON "PackageVersion"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageVersion_packageId_version_key" ON "PackageVersion"("packageId", "version");

-- CreateIndex
CREATE INDEX "Sbom_scanId_idx" ON "Sbom"("scanId");

-- CreateIndex
CREATE INDEX "Sbom_packageId_idx" ON "Sbom"("packageId");

-- CreateIndex
CREATE INDEX "Sbom_packageVersionId_idx" ON "Sbom"("packageVersionId");

-- CreateIndex
CREATE INDEX "Vulnerability_packageId_idx" ON "Vulnerability"("packageId");

-- CreateIndex
CREATE INDEX "Vulnerability_versionId_idx" ON "Vulnerability"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vulnerability_packageId_vulnId_key" ON "Vulnerability"("packageId", "vulnId");

-- CreateIndex
CREATE INDEX "Attestation_packageId_idx" ON "Attestation"("packageId");

-- CreateIndex
CREATE INDEX "Attestation_versionId_idx" ON "Attestation"("versionId");

-- CreateIndex
CREATE INDEX "SandboxRun_scanId_idx" ON "SandboxRun"("scanId");

-- CreateIndex
CREATE INDEX "SandboxEvent_sandboxRunId_idx" ON "SandboxEvent"("sandboxRunId");

-- CreateIndex
CREATE INDEX "Finding_scanId_idx" ON "Finding"("scanId");

-- CreateIndex
CREATE INDEX "Finding_sandboxRunId_idx" ON "Finding"("sandboxRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_name_key" ON "Policy"("name");

-- CreateIndex
CREATE INDEX "PolicyDecision_findingId_idx" ON "PolicyDecision"("findingId");

-- CreateIndex
CREATE INDEX "PolicyDecision_policyId_idx" ON "PolicyDecision"("policyId");

-- CreateIndex
CREATE INDEX "AIExplanation_scanId_idx" ON "AIExplanation"("scanId");

-- CreateIndex
CREATE INDEX "Approval_findingId_idx" ON "Approval"("findingId");

-- CreateIndex
CREATE INDEX "Approval_repositoryId_idx" ON "Approval"("repositoryId");

-- CreateIndex
CREATE INDEX "Baseline_repositoryId_idx" ON "Baseline"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_repositoryId_name_key" ON "Baseline"("repositoryId", "name");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanTarget" ADD CONSTRAINT "ScanTarget_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyChange" ADD CONSTRAINT "DependencyChange_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyChange" ADD CONSTRAINT "DependencyChange_packageName_fkey" FOREIGN KEY ("packageName") REFERENCES "Package"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageVersion" ADD CONSTRAINT "PackageVersion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sbom" ADD CONSTRAINT "Sbom_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sbom" ADD CONSTRAINT "Sbom_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sbom" ADD CONSTRAINT "Sbom_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxRun" ADD CONSTRAINT "SandboxRun_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxEvent" ADD CONSTRAINT "SandboxEvent_sandboxRunId_fkey" FOREIGN KEY ("sandboxRunId") REFERENCES "SandboxRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_sandboxRunId_fkey" FOREIGN KEY ("sandboxRunId") REFERENCES "SandboxRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExplanation" ADD CONSTRAINT "AIExplanation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baseline" ADD CONSTRAINT "Baseline_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
