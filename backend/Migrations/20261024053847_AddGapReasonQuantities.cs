using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddGapReasonQuantities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "GapQtyMachineBreakdown",
                table: "ProductionEntries",
                type: "float",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "GapQtyManPower",
                table: "ProductionEntries",
                type: "float",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "GapQtyMaterialShortage",
                table: "ProductionEntries",
                type: "float",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "GapQtyMethod",
                table: "ProductionEntries",
                type: "float",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GapQtyMachineBreakdown",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "GapQtyManPower",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "GapQtyMaterialShortage",
                table: "ProductionEntries");

            migrationBuilder.DropColumn(
                name: "GapQtyMethod",
                table: "ProductionEntries");
        }
    }
}
