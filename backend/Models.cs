using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AmacBackend.Models;

public class Supervisor
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [MaxLength(20)]
    public string Status { get; set; } = "Active"; // Active, Inactive
    
    [MaxLength(100)]
    public string Department { get; set; } = string.Empty;
}

public class Operator
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string PunchNo { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [MaxLength(5)]
    public string AliasLetter { get; set; } = string.Empty; // For Traceability ID collision resolution
    
    public int? SupervisorId { get; set; }
    [ForeignKey("SupervisorId")]
    public Supervisor? Supervisor { get; set; }
    
    [MaxLength(100)]
    public string Department { get; set; } = string.Empty;
    
    [MaxLength(20)]
    public string Shift { get; set; } = string.Empty; // Shift A, Shift B
    
    [MaxLength(20)]
    public string Status { get; set; } = "Active";
}

public class MasterPart
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string PartNo { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(200)]
    public string PartName { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string Customer { get; set; } = string.Empty;
    
    public double ShotWeight { get; set; }
    public double CastingWeight { get; set; }
    public double CycleTime { get; set; }
    
    [MaxLength(100)]
    public string Material { get; set; } = string.Empty;
    
    public bool RequiresCore { get; set; }
    [MaxLength(50)]
    public string? CoreType { get; set; }
    
    public bool RequiresHT { get; set; }
    [MaxLength(50)]
    public string? HTType { get; set; }
    
    public double PlannedQty { get; set; }
    public double ProductionOutputPerMachine { get; set; }
    
    [MaxLength(100)]
    public string DispatchLocation { get; set; } = string.Empty;
}

public class MonthlyDispatchPlan
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    public DateTime MonthYear { get; set; }
    
    public int PartId { get; set; }
    [ForeignKey("PartId")]
    public MasterPart? Part { get; set; }
    
    public double DispatchTarget { get; set; }
    public double? TargetRev01 { get; set; }
    public double RejectionBufferPercentage { get; set; }
    public double AvailableStock { get; set; }
}

public class ProductionPlan
{
    [Key]
    public int Id { get; set; }
    
    public int PartId { get; set; }
    [ForeignKey("PartId")]
    public MasterPart? Part { get; set; }
    
    public DateTime PlannedDate { get; set; }
    
    [MaxLength(20)]
    public string Shift { get; set; } = string.Empty;
    
    public double PlannedQty { get; set; }
}

public class ProductionEntry
{
    [Key]
    public int Id { get; set; }
    
    [MaxLength(100)]
    public string TraceabilityBatchId { get; set; } = string.Empty;
    
    public DateTime Date { get; set; } // Business Date
    
    [MaxLength(20)]
    public string Shift { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string OperatorPunchNo { get; set; } = string.Empty;
    
    public int PartId { get; set; }
    [ForeignKey("PartId")]
    public MasterPart? Part { get; set; }
    
    public int? PlanId { get; set; }
    [ForeignKey("PlanId")]
    public ProductionPlan? Plan { get; set; }
    
    [MaxLength(100)]
    public string DieNo { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string MachineNumber { get; set; } = string.Empty;
    
    public double CycleTime { get; set; }
    public double PlannedQty { get; set; }
    public double ActualQty { get; set; }
    public double Gap { get; set; }
    
    public bool GapReasonManPower { get; set; }
    public bool GapReasonMachineBreakdown { get; set; }
    public bool GapReasonMaterialShortage { get; set; }
    public bool GapReasonMethod { get; set; }
    
    public double GapQtyManPower { get; set; }
    public double GapQtyMachineBreakdown { get; set; }
    public double GapQtyMaterialShortage { get; set; }
    public double GapQtyMethod { get; set; }
    
    public double RejectionQty { get; set; }
    
    [MaxLength(500)]
    public string ReasonForRejection { get; set; } = string.Empty;
    
    public double Efficiency { get; set; }
    
    [MaxLength(1000)]
    public string Remark { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string Status { get; set; } = "Draft"; // Draft, Submitted, Approved, Returned
    
    [MaxLength(1000)]
    public string ReturnReason { get; set; } = string.Empty;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
}

public class DownstreamProcessEntry
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string DepartmentName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string TraceabilityBatchId { get; set; } = string.Empty;

    public int? PartId { get; set; }
    [ForeignKey("PartId")]
    public MasterPart? Part { get; set; }

    [MaxLength(100)]
    public string PartNo { get; set; } = string.Empty;

    [MaxLength(200)]
    public string PartName { get; set; } = string.Empty;

    public DateTime Date { get; set; }

    [MaxLength(20)]
    public string Shift { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Supervisor { get; set; } = string.Empty;

    [MaxLength(50)]
    public string OperatorPunchNo { get; set; } = string.Empty;

    [MaxLength(100)]
    public string OperatorName { get; set; } = string.Empty;

    public float PlannedQty { get; set; }
    public float ActualQty { get; set; }
    public float Gap { get; set; }

    [MaxLength(255)]
    public string GapReason { get; set; } = string.Empty;

    public bool GapReasonMachine { get; set; }
    public bool GapReasonManpower { get; set; }
    public bool GapReasonProductionOutput { get; set; }

    public float InputQty { get; set; }
    public float ProcessedQty { get; set; }
    public float RejectionQty { get; set; }
    
    [MaxLength(500)]
    public string ReasonForRejection { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Remark { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = "Draft";

    [MaxLength(1000)]
    public string ReturnReason { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
}

public class User
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string Username { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(255)]
    public string PasswordHash { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(50)]
    public string Role { get; set; } = "Department"; // Admin, Department
    
    /// <summary>
    /// For Department role users: which department they belong to.
    /// E.g. "DCF", "UT", "Production", etc. Empty for Admin.
    /// </summary>
    [MaxLength(100)]
    public string Department { get; set; } = string.Empty;
}

public class GapReasonMaster
{
    [Key]
    public int Id { get; set; }

    [MaxLength(50)]
    public string Department { get; set; } = "Production"; // Production, DCF, Quality, HT & Finishing, Machining, Storage & Dispatch, All

    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty; // "Manpower", "Machine Breakdown", "Raw Material", "Method"

    [Required]
    [MaxLength(150)]
    public string ReasonName { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class RejectionReasonMaster
{
    [Key]
    public int Id { get; set; }

    [MaxLength(50)]
    public string Department { get; set; } = "Production"; // Production, DCF, Quality, HT & Finishing, Machining, Storage & Dispatch, All

    [Required]
    [MaxLength(150)]
    public string ReasonName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Category { get; set; } = "General"; // Casting, Finishing, etc.

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Supervisor> Supervisors => Set<Supervisor>();
    public DbSet<Operator> Operators => Set<Operator>();
    public DbSet<MasterPart> MasterParts => Set<MasterPart>();
    public DbSet<MonthlyDispatchPlan> MonthlyDispatchPlans => Set<MonthlyDispatchPlan>();
    public DbSet<ProductionPlan> ProductionPlans => Set<ProductionPlan>();
    public DbSet<ProductionEntry> ProductionEntries => Set<ProductionEntry>();
    public DbSet<DownstreamProcessEntry> DownstreamProcessEntries => Set<DownstreamProcessEntry>();
    public DbSet<User> Users => Set<User>();
    public DbSet<GapReasonMaster> GapReasonMasters => Set<GapReasonMaster>();
    public DbSet<RejectionReasonMaster> RejectionReasonMasters => Set<RejectionReasonMaster>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Operator>()
            .HasIndex(o => o.PunchNo)
            .IsUnique();

        modelBuilder.Entity<MasterPart>()
            .HasIndex(p => p.PartNo)
            .IsUnique();

        modelBuilder.Entity<ProductionEntry>()
            .HasIndex(e => e.Date);
            
        modelBuilder.Entity<ProductionEntry>()
            .HasIndex(e => e.TraceabilityBatchId);
            
        modelBuilder.Entity<ProductionEntry>()
            .HasIndex(e => new { e.PartId, e.Date });
            
        modelBuilder.Entity<DownstreamProcessEntry>()
            .HasIndex(e => e.Date);
            
        modelBuilder.Entity<DownstreamProcessEntry>()
            .HasIndex(e => new { e.DepartmentName, e.Date });
            
        modelBuilder.Entity<MonthlyDispatchPlan>()
            .HasIndex(e => new { e.PartId, e.MonthYear });
    }
}

public class MasterDatabaseDto
{
    // Part Data
    public int PartId { get; set; }
    public string PartNo { get; set; } = string.Empty;
    public string PartName { get; set; } = string.Empty;
    public string Customer { get; set; } = string.Empty;
    public double ShotWeight { get; set; }
    public double CastingWeight { get; set; }
    public double CycleTime { get; set; }
    public string Material { get; set; } = string.Empty;
    public bool RequiresCore { get; set; }
    public string? CoreType { get; set; }
    public bool RequiresHT { get; set; }
    public string? HTType { get; set; }
    public double ProductionOutputPerMachine { get; set; }
    public string DispatchLocation { get; set; } = string.Empty;

    // Monthly Dispatch Plan Data
    public int? PlanId { get; set; } // Nullable if no plan exists yet for the selected month
    public string MonthYear { get; set; } = string.Empty; // Format: "yyyy-MM"
    public double DispatchTarget { get; set; } // Rev 00
    public double? TargetRev01 { get; set; } // Rev 01
    public double RejectionBufferPercentage { get; set; }
    public double CalculatedRejectionPercentage { get; set; }
}

