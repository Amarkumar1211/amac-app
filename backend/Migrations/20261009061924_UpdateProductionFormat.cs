using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class UpdateProductionFormat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReasonForGap",
                table: "ProductionEntries");

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonMachineBreakdown",
                table: "ProductionEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonManPower",
                table: "ProductionEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonMaterialShortage",
                table: "ProductionEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonMethod",
                table: "ProductionEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "MachineNumber",
                table: "ProductionEntries",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GapReasonMachineBreakdown",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "GapReasonManPower",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "GapReasonMaterialShortage",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "GapReasonMethod",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "MachineNumber",
                table: "ProductionEntries");

            migrationBuilder.AddColumn<string>(
                name: "ReasonForGap",
                table: "ProductionEntries",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");
        }
    }
}
