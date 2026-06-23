using Microsoft.EntityFrameworkCore;

namespace MyProject.Data
{
    public sealed class DbProjectRecord
    {
        public int Id { get; set; }
        public string Name { get; set; } = "New Project";
        public DateTime ProjectStart { get; set; }
        public string WorkingDaysJson { get; set; } = "[]";
        public string? ViewSettingsJson { get; set; } // Legacy column; schedule view settings are stored locally.
        public DateTime UpdatedUtc { get; set; }
        public long Version { get; set; }
        public string? UpdatedBy { get; set; }

        public List<DbTaskRecord> Tasks { get; set; } = new();
        public List<DbDependencyRecord> Dependencies { get; set; } = new();
        public List<DbAssignmentRecord> Assignments { get; set; } = new();
        public List<DbNoteRecord> Notes { get; set; } = new();
    }

    public sealed class DbTaskRecord
    {
        public int ProjectId { get; set; }
        public int TaskId { get; set; }
        public int ParentId { get; set; } = -1;
        public string Name { get; set; } = "New Task";
        public DateTime StartDate { get; set; }
        public int DurationDays { get; set; } = 5;
        public double Progress { get; set; }
        public string TaskType { get; set; } = "Normal";
        public int IndentLevel { get; set; }
        public bool IsExpanded { get; set; } = true;
        public string AssignedTo { get; set; } = "";
        public string Notes { get; set; } = "";
        public int? BarColorArgb { get; set; }
        public int? ProgressColorArgb { get; set; }
        public int? BandColorArgb { get; set; }
        public bool AutoSchedule { get; set; } = true;
        public string Deliverable { get; set; } = "";
        public bool IsCritical { get; set; }
        public string? SummaryBarStyle { get; set; }

        public DbProjectRecord? Project { get; set; }
    }

    public sealed class DbDependencyRecord
    {
        public int ProjectId { get; set; }
        public int PredecessorId { get; set; }
        public int SuccessorId { get; set; }
        public string Type { get; set; } = "FS";
        public int LagDays { get; set; }
        public string? StartLineEnd { get; set; }
        public string? EndLineEnd { get; set; }

        public DbProjectRecord? Project { get; set; }
    }

    public sealed class DbAssignmentRecord
    {
        public int ProjectId { get; set; }
        public int TaskId { get; set; }
        public string ResourceName { get; set; } = "";
        public double AllocationPercent { get; set; } = 100;

        public DbProjectRecord? Project { get; set; }
    }

    public sealed class DbNoteRecord
    {
        public int ProjectId { get; set; }
        public int NoteId { get; set; }
        public string Title { get; set; } = "New Note";
        public string Body { get; set; } = "";
        public string BodyRtf { get; set; } = "";
        public int TaskId { get; set; } = -1;
        public int OffsetDays { get; set; }
        public DateTime AnchorDate { get; set; }
        public int ContentY { get; set; }
        public int ContentX { get; set; }

        public DbProjectRecord? Project { get; set; }
    }

    public sealed class ProjectDbContext : DbContext
    {
        public ProjectDbContext(DbContextOptions<ProjectDbContext> options) : base(options)
        {
        }

        public DbSet<DbProjectRecord> Projects => Set<DbProjectRecord>();
        public DbSet<DbTaskRecord> Tasks => Set<DbTaskRecord>();
        public DbSet<DbDependencyRecord> Dependencies => Set<DbDependencyRecord>();
        public DbSet<DbAssignmentRecord> Assignments => Set<DbAssignmentRecord>();
        public DbSet<DbNoteRecord> Notes => Set<DbNoteRecord>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<DbProjectRecord>(entity =>
            {
                entity.ToTable("mp_projects");
                entity.HasKey(p => p.Id);
                entity.Property(p => p.Name).HasMaxLength(256).IsRequired();
                entity.Property(p => p.WorkingDaysJson).HasMaxLength(64).IsRequired();
                entity.Property(p => p.UpdatedBy).HasMaxLength(256);
            });

            modelBuilder.Entity<DbTaskRecord>(entity =>
            {
                entity.ToTable("mp_tasks");
                entity.HasKey(t => new { t.ProjectId, t.TaskId });
                entity.Property(t => t.Name).HasMaxLength(512).IsRequired();
                entity.Property(t => t.TaskType).HasMaxLength(32).IsRequired();
                entity.HasOne(t => t.Project).WithMany(p => p.Tasks).HasForeignKey(t => t.ProjectId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<DbDependencyRecord>(entity =>
            {
                entity.ToTable("mp_dependencies");
                entity.HasKey(d => new { d.ProjectId, d.PredecessorId, d.SuccessorId });
                entity.Property(d => d.Type).HasMaxLength(8).IsRequired();
                entity.HasOne(d => d.Project).WithMany(p => p.Dependencies).HasForeignKey(d => d.ProjectId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<DbAssignmentRecord>(entity =>
            {
                entity.ToTable("mp_assignments");
                entity.HasKey(a => new { a.ProjectId, a.TaskId, a.ResourceName });
                entity.Property(a => a.ResourceName).HasMaxLength(256).IsRequired();
                entity.HasOne(a => a.Project).WithMany(p => p.Assignments).HasForeignKey(a => a.ProjectId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<DbNoteRecord>(entity =>
            {
                entity.ToTable("mp_notes");
                entity.HasKey(n => new { n.ProjectId, n.NoteId });
                entity.Property(n => n.Title).HasMaxLength(256).IsRequired();
                entity.HasOne(n => n.Project).WithMany(p => p.Notes).HasForeignKey(n => n.ProjectId).OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
