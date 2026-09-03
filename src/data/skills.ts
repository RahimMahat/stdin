import type { TreeNode } from '../render/ast'

/**
 * Depth carries the information here, not a percentage bar. A skill sits under
 * the stage of the pipeline where it actually does work, which means the tree
 * doubles as a claim about how the work is organised — and in phase 3 these
 * same groupings become the sub-layer of the DAG.
 */
export const skills: TreeNode = {
  label: 'skills/',
  children: [
    {
      label: 'ingestion',
      children: [
        { label: 'AWS Glue', note: 'PySpark ETL jobs, batch side' },
        { label: 'Lambda + SQS', note: 'event-driven, stream side' },
        { label: 'API Gateway', note: 'token-authenticated integrations' },
      ],
    },
    {
      label: 'transformation',
      children: [
        { label: 'PySpark' },
        { label: 'dbt' },
        { label: 'SQL', note: 'Redshift, Snowflake' },
        { label: 'Python', note: 'the glue between all of it' },
      ],
    },
    {
      label: 'orchestration',
      children: [
        { label: 'Jenkins', note: 'pipeline scheduling and CI' },
        { label: 'GitHub Actions', note: 'build and deploy' },
      ],
    },
    {
      label: 'storage',
      children: [
        { label: 'Amazon Redshift' },
        { label: 'Snowflake', note: 'SnowPro Core certified' },
        { label: 'Amazon S3', note: 'landing and curated zones' },
        { label: 'Denodo', note: 'virtualization over the warehouse' },
      ],
    },
    {
      label: 'platform',
      children: [
        { label: 'AWS', note: 'Solutions Architect Associate, in progress' },
        { label: 'Terraform + CDK', note: 'reusable modules, reviewed in PRs' },
        { label: 'Linux + Bash' },
        { label: 'Containers' },
      ],
    },
    {
      label: 'bi',
      children: [{ label: 'QuickSight', note: 'business stakeholders, not engineers' }],
    },
  ],
}
